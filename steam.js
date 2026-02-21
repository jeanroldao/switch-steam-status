/**
 * steam.js — Steam Rich Presence via steamworks.js
 *
 * steamworks.js ships prebuilt binaries for Node.js — no Steamworks SDK
 * headers or manual compilation required.  Only steam_api64.dll (from the
 * Steamworks SDK) is needed at runtime alongside the project root.
 */

import { init, localplayer } from 'steamworks.js';

let initialised = false;

/**
 * Initialise the Steam API.
 * Must be called before any Rich Presence calls.
 * Throws if Steam is not running or the App ID is invalid.
 *
 * @param {string|number} appId  Steam App ID (e.g. 480 for Spacewar)
 */
export function initSteam(appId) {
  try {
    init(Number(appId));
    initialised = true;
  } catch (err) {
    throw new Error(
      `Steam API initialisation failed: ${err.message}\n` +
        '  • Make sure Steam is running and you are logged in.\n' +
        '  • Check that STEAM_APP_ID in .env is a valid App ID.\n' +
        '  • Ensure steam_api64.dll is in the project root.'
    );
  }

  console.log(`[Steam] Initialised (App ID: ${appId})`);
}

/**
 * Set the Steam Rich Presence status to the current Switch game name.
 *
 * @param {string} gameName  Title of the Switch game currently being played
 */
export function setGamePresence(gameName) {
  if (!initialised) return;
  localplayer.setRichPresence('status', gameName);
}

/**
 * Clear Steam Rich Presence (shown as idle / no sub-status).
 */
export function clearPresence() {
  if (!initialised) return;
  localplayer.setRichPresence('status', '');
}
