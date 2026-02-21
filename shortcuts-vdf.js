/**
 * shortcuts-vdf.js — Minimal binary VDF reader/writer for Steam shortcuts.vdf
 *
 * Binary VDF node types:
 *   0x00  nested map  — key (null-terminated) + map entries terminated by 0x08
 *   0x01  string      — key (null-terminated) + value (null-terminated)
 *   0x02  int32       — key (null-terminated) + 4-byte little-endian signed int
 *   0x08  end-of-map  — single byte, no key/value
 *
 * Maps are represented as JS Map objects to preserve field insertion order,
 * which is important for writing back a byte-identical structure.
 */

export const T_MAP   = 0x00;
export const T_STR   = 0x01;
export const T_INT32 = 0x02;
const T_END   = 0x08;

// ── CRC32 (Steam's shortcut appid formula) ────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

/**
 * Compute the appid Steam assigns to a non-Steam shortcut.
 *
 * Steam's formula: CRC32(exeWithQuotes + appName) | 0x80000000, stored as int32.
 *
 * @param {string} exeWithQuotes  Exe path with surrounding quotes, e.g. '"C:\\...\\node.exe"'
 * @param {string} appName        AppName field value, e.g. 'Switch Status'
 * @returns {number}  Signed int32 (as stored in shortcuts.vdf)
 */
export function computeShortcutAppId(exeWithQuotes, appName) {
  const buf = Buffer.from(exeWithQuotes + appName, 'utf8');
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  crc = (crc ^ 0xFFFFFFFF) >>> 0;          // finalise → unsigned 32-bit
  return ((crc | 0x80000000) | 0);          // set high bit → signed int32
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseShortcuts(buf) {
  let pos = 0;

  function readByte() {
    return buf[pos++];
  }

  function readStr() {
    const start = pos;
    while (pos < buf.length && buf[pos] !== 0x00) pos++;
    const s = buf.slice(start, pos).toString('utf8');
    pos++; // consume null terminator
    return s;
  }

  function readMap() {
    const m = new Map();
    while (pos < buf.length) {
      const t = readByte();
      if (t === T_END) break;
      const k = readStr();
      if      (t === T_MAP)   m.set(k, { type: T_MAP,   value: readMap() });
      else if (t === T_STR)   m.set(k, { type: T_STR,   value: readStr() });
      else if (t === T_INT32) { m.set(k, { type: T_INT32, value: buf.readInt32LE(pos) }); pos += 4; }
      // Unknown types are skipped (shouldn't occur in shortcuts.vdf)
    }
    return m;
  }

  // Root node: 0x00 "shortcuts" 0x00 <map entries> 0x08
  readByte(); // T_MAP
  readStr();  // "shortcuts"
  return readMap();
}

// ── Serialiser ────────────────────────────────────────────────────────────────

export function serializeShortcuts(shortcuts) {
  const chunks = [];

  const wb = (b) => chunks.push(Buffer.from([b]));
  const ws = (s) => chunks.push(Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0x00])]));
  const wi = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n, 0); chunks.push(b); };

  function writeMap(m) {
    for (const [k, { type, value }] of m) {
      wb(type);
      ws(k);
      if      (type === T_MAP)   writeMap(value);
      else if (type === T_STR)   ws(value);
      else if (type === T_INT32) wi(value);
    }
    wb(T_END);
  }

  // Root wrapper
  wb(T_MAP);
  ws('shortcuts');
  writeMap(shortcuts);
  wb(T_END);

  return Buffer.concat(chunks);
}
