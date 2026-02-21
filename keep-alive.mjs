/**
 * keep-alive.mjs — Dummy process used as a non-Steam shortcut target.
 *
 * Add node.exe as a non-Steam game in Steam, with this file as the
 * Launch Options argument. While this process is running, Steam shows
 * you as "Playing <shortcut name>".
 *
 * Writes its PID to keep-alive.pid so steam.js can kill it when needed.
 */

import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));
const pidFile = join(dir, 'keep-alive.pid');

writeFileSync(pidFile, String(process.pid), 'utf8');

process.on('exit', () => {
  try { unlinkSync(pidFile); } catch {}
});

// Hang indefinitely — Steam tracks this process to determine in-game status.
await new Promise(() => {});
