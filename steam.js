/**
 * steam.js — Steam "in-game" status via a non-Steam shortcut
 *
 * Manages a non-Steam shortcut whose AppName is updated to match the current
 * Switch game. Steam is restarted on each game change so the new name is
 * picked up, then the keep-alive.mjs dummy process is relaunched through
 * Steam, causing friends to see "Playing <Switch game name>".
 *
 * The shortcut is created automatically in shortcuts.vdf if not present.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseShortcuts, serializeShortcuts,
  computeShortcutAppId, T_MAP, T_STR, T_INT32,
} from './shortcuts-vdf.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const PID_FILE  = join(__dir, 'keep-alive.pid');
const KEEP_ALIVE = resolve(join(__dir, 'keep-alive.mjs'));
const SHORTCUT_NAME      = 'Switch Status';
const STEAM_RESTART_WAIT_MS = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let steamPath     = null;
let vdfPath       = null;
let shortcutKey   = null;
let shortcutAppId = null;
let restarting    = false;

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initSteam() {
  steamPath = process.env.STEAM_PATH ?? 'C:\\Program Files (x86)\\Steam';

  const userId = process.env.STEAM_USER_ID ?? autoDetectUserId();
  if (!userId) {
    throw new Error(
      '[Steam] Cannot detect Steam user ID.\n' +
      '  Add STEAM_USER_ID=205401060 to your .env\n' +
      '  (Your Steam64 ID 76561198165666788 → account ID = 205401060)'
    );
  }

  vdfPath = join(steamPath, 'userdata', String(userId), 'config', 'shortcuts.vdf');
  if (!existsSync(vdfPath)) {
    throw new Error(
      `[Steam] shortcuts.vdf not found: ${vdfPath}\n` +
      '  Check STEAM_PATH and STEAM_USER_ID in .env'
    );
  }

  findOrCreateShortcut();
  console.log(`[Steam] Shortcut ready (key=${shortcutKey}, appid=${shortcutAppId >>> 0})`);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function setGamePresence(gameName) {
  if (restarting) {
    console.log('[Steam] Already restarting — skipping duplicate update');
    return;
  }
  await updateAndRestart(gameName);
}

export async function clearPresence() {
  killKeepAlive();
  console.log('[Steam] Keep-alive stopped — no longer in-game');
}

// ── Internal ──────────────────────────────────────────────────────────────────

function autoDetectUserId() {
  const userDataDir = join(steamPath, 'userdata');
  if (!existsSync(userDataDir)) return null;

  const dirs = readdirSync(userDataDir).filter((d) => /^\d+$/.test(d));
  if (dirs.length === 1) return dirs[0];

  // Multiple accounts: find the one whose shortcuts.vdf contains our shortcut
  for (const dir of dirs) {
    const vdf = join(userDataDir, dir, 'config', 'shortcuts.vdf');
    if (!existsSync(vdf)) continue;
    try {
      const shortcuts = parseShortcuts(readFileSync(vdf));
      for (const entry of shortcuts.values()) {
        if (entry.type !== T_MAP) continue;
        const opts = (entry.value.get('LaunchOptions')?.value ?? '').replace(/^"|"$/g, '');
        if (opts.toLowerCase().includes('keep-alive.mjs')) return dir;
      }
    } catch {}
  }

  return dirs[0] ?? null; // best-effort fallback
}

function findOrCreateShortcut() {
  const shortcuts = parseShortcuts(readFileSync(vdfPath));

  for (const [key, entry] of shortcuts) {
    if (entry.type !== T_MAP) continue;
    const inner = entry.value;
    const opts = (inner.get('LaunchOptions')?.value ?? '').replace(/^"|"$/g, '');
    if (opts.toLowerCase().includes('keep-alive.mjs')) {
      shortcutKey   = key;
      shortcutAppId = inner.get('appid')?.value ?? null;
      return; // found
    }
  }

  // Not found — create it automatically
  createShortcut(shortcuts);
}

function createShortcut(shortcuts) {
  const exeWithQuotes = `"${process.execPath}"`;
  const appid = computeShortcutAppId(exeWithQuotes, SHORTCUT_NAME);

  // Next available numeric key
  const usedKeys = Array.from(shortcuts.keys()).map(Number).filter((n) => !isNaN(n));
  const nextKey  = String(usedKeys.length > 0 ? Math.max(...usedKeys) + 1 : 0);

  const inner = new Map([
    ['appid',               { type: T_INT32, value: appid }],
    ['AppName',             { type: T_STR,   value: SHORTCUT_NAME }],
    ['Exe',                 { type: T_STR,   value: exeWithQuotes }],
    ['StartDir',            { type: T_STR,   value: `"${__dir}"` }],
    ['icon',                { type: T_STR,   value: '' }],
    ['ShortcutPath',        { type: T_STR,   value: '' }],
    ['LaunchOptions',       { type: T_STR,   value: `"${KEEP_ALIVE}"` }],
    ['IsHidden',            { type: T_INT32, value: 0 }],
    ['AllowDesktopConfig',  { type: T_INT32, value: 1 }],
    ['AllowOverlay',        { type: T_INT32, value: 1 }],
    ['OpenVR',              { type: T_INT32, value: 0 }],
    ['Devkit',              { type: T_INT32, value: 0 }],
    ['DevkitGameID',        { type: T_STR,   value: '' }],
    ['DevkitOverrideAppID', { type: T_INT32, value: 0 }],
    ['LastPlayTime',        { type: T_INT32, value: 0 }],
    ['FlatpakAppID',        { type: T_STR,   value: '' }],
    ['tags',                { type: T_MAP,   value: new Map() }],
  ]);

  shortcuts.set(nextKey, { type: T_MAP, value: inner });
  writeFileSync(vdfPath, serializeShortcuts(shortcuts));

  shortcutKey   = nextKey;
  shortcutAppId = appid;

  console.log(`[Steam] Shortcut created automatically (key=${nextKey}, appid=${appid >>> 0})`);
  console.log('[Steam] It will appear in Steam after the first game change triggers a restart.');
}

async function updateAndRestart(gameName) {
  restarting = true;
  try {
    // 1. Kill existing keep-alive process
    killKeepAlive();

    // 2. Update shortcuts.vdf — keep appid consistent with the new name.
    //    Steam recomputes appid = CRC32(exe + AppName) | 0x80000000 when loading,
    //    so we must update both fields together or the steam://rungameid URL will
    //    point to the wrong (stale) appid.
    const exeWithQuotes = `"${process.execPath}"`;
    const newAppId = computeShortcutAppId(exeWithQuotes, gameName);
    shortcutAppId = newAppId;

    const shortcuts = parseShortcuts(readFileSync(vdfPath));
    const entry = shortcuts.get(shortcutKey);
    if (entry?.type === T_MAP) {
      entry.value.set('AppName', { type: T_STR,   value: gameName });
      entry.value.set('appid',   { type: T_INT32, value: newAppId });
    }
    writeFileSync(vdfPath, serializeShortcuts(shortcuts));
    console.log(`[Steam] Shortcut renamed to: ${gameName} (appid=${newAppId >>> 0})`);

    // 3. Kill Steam
    console.log('[Steam] Restarting Steam...');
    try { execSync('taskkill /f /im steam.exe', { stdio: 'ignore' }); } catch {}
    await sleep(3_000);

    // 4. Start Steam
    spawn(join(steamPath, 'steam.exe'), [], { detached: true, stdio: 'ignore' }).unref();

    // 5. Wait for Steam to initialise
    console.log(`[Steam] Waiting ${STEAM_RESTART_WAIT_MS / 1000}s for Steam to load...`);
    await sleep(STEAM_RESTART_WAIT_MS);

    // 6. Launch our shortcut so Steam shows us as in-game
    const gameId = toGameId(shortcutAppId);
    console.log(`[Steam] Launching shortcut (appid=${shortcutAppId >>> 0}, gameId=${gameId})`);
    spawn(join(steamPath, 'steam.exe'), [`steam://rungameid/${gameId}`], {
      detached: true, stdio: 'ignore',
    }).unref();
    await sleep(2_000);

    console.log('[Steam] Done — friends should see: Playing ' + gameName);
  } finally {
    restarting = false;
  }
}

function killKeepAlive() {
  if (!existsSync(PID_FILE)) return;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!isNaN(pid)) process.kill(pid, 'SIGTERM');
  } catch {}
}

/**
 * Convert the 32-bit signed appid to the 64-bit ID used in steam://rungameid URLs.
 * Formula: (top32 << 32) | 0x02000000  where top32 = CRC32|0x80000000 (unsigned 32-bit)
 */
function toGameId(appId32) {
  const top32 = BigInt(appId32 >>> 0);
  return String((top32 << 32n) | BigInt(0x02000000));
}
