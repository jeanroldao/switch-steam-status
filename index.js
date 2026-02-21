/**
 * index.js — Main polling loop
 *
 * Polls Nintendo Switch Online presence every 30 seconds and mirrors
 * the current game title to Steam Rich Presence.
 */

import 'dotenv/config';
import { initNintendo, getFriendPresence } from './nintendo.js';
import { initSteam, setGamePresence, clearPresence } from './steam.js';

const POLL_INTERVAL_MS = 30_000;

// ── Environment validation ────────────────────────────────────────────────────

function validateEnv() {
  const required = ['NSO_SESSION_TOKEN', 'NSO_FRIEND_NAME'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[Config] Missing required variables: ${missing.join(', ')}`);
    console.error('         Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────

// Track the last-known game name to avoid redundant Rich Presence calls.
let currentGame = null; // null = not playing / presence cleared

async function poll() {
  const presence = await getFriendPresence();
  const isPlaying =
    (presence?.state === 'PLAYING' || presence?.state === 'ONLINE') &&
    typeof presence.game?.name === 'string';

  if (isPlaying) {
    const gameName = presence.game.name;
    if (gameName !== currentGame) {
      console.log(`[Status] Now playing: ${gameName}`);
      await setGamePresence(gameName);
      currentGame = gameName;
    }
    // Presence unchanged — no Steam call needed
  } else {
    if (currentGame !== null) {
      const reason = presence?.state ?? 'unknown';
      console.log(`[Status] Not playing (state: ${reason}) — clearing Rich Presence`);
      await clearPresence();
      currentGame = null;
    }
    // Already cleared — nothing to do
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  validateEnv();

  const { NSO_SESSION_TOKEN, NSO_FRIEND_NAME } = process.env;

  // Initialise Nintendo first so auth errors surface before Steam init.
  await initNintendo(NSO_SESSION_TOKEN, NSO_FRIEND_NAME);
  await initSteam();

  console.log(`\n[Main] Polling every ${POLL_INTERVAL_MS / 1000}s for: ${NSO_FRIEND_NAME}`);
  console.log('[Main] Press Ctrl+C to stop.\n');

  // First poll immediately, then on the interval.
  try {
    await poll();
  } catch (err) {
    console.error('[Poll] Error on first poll:', err);
  }

  setInterval(async () => {
    try {
      await poll();
    } catch (err) {
      console.error('[Poll] Error:', err);
    }
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
