# switch-steam-status

Polls your Nintendo Switch Online presence and mirrors the current game title
to Steam, so Steam friends see **"Playing [Switch game name]"**.

```
Secondary NSO account ──(nxapi)──▶ friends list ──▶ your main account's presence
                                                          │
                                                          ▼
                                              Steam non-Steam shortcut
                                              (renamed to current Switch game,
                                               keep-alive.mjs held in-game)
```

Because Nintendo's API only exposes **friends'** presence (not your own),
a secondary Nintendo account that is friends with your main account is required.

Works when Windows is locked. Does not work during standby/sleep.

---

## How it works

1. Every 30 seconds the app polls the NSO Coral API for your main account's
   presence via the secondary account's friend list.
2. When a game change is detected, the app renames a non-Steam Steam shortcut
   (in `shortcuts.vdf`) to the current Switch game title.
3. If the name changed, Steam is restarted so it picks up the new shortcut name
   (~18 s). If the game is the same as last session, the restart is skipped.
4. `steam://rungameid/<id>` is called to launch the shortcut through Steam.
   Steam spawns `node keep-alive.mjs`, tracks that process as "in-game", and
   shows **"Playing [Switch game name]"** to friends.
5. When you stop playing, the keep-alive process is killed and the status clears.

The non-Steam shortcut is created automatically on first run — no manual setup
in Steam is needed.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18 or later | `node --version` to check |
| Steam client | Must be running and logged in when the tool starts |
| Two Nintendo accounts | One main, one secondary (free account works) |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
copy .env.example .env
```

Open `.env` and fill in the values (details below).

### 3. Get your Nintendo session token (secondary account)

```bash
npx nxapi nintendo auth
```

Follow the prompts — nxapi opens a Nintendo login URL. After login, copy the
`session_token` value from the output and paste it into `NSO_SESSION_TOKEN`
in your `.env`.

> **Security note:** treat the session token like a password. It grants full
> access to the Nintendo account. Keep it in `.env` and never commit it.

### 4. Find your main account's Switch display name

On your **main** Switch: **System Settings → Profile → Nickname**.

Set `NSO_FRIEND_NAME` in `.env` to this value (exact match, case-sensitive).

Make sure the secondary account has an accepted friend relationship with your
main account on Nintendo Switch before running.

### 5. Set Steam path and account ID

- **`STEAM_PATH`** — folder where Steam is installed (e.g. `D:\Steam`).
- **`STEAM_USER_ID`** — the lower 32 bits of your Steam64 ID.
  Look up your profile on [steamid.io](https://steamid.io) and use the
  **steamID32** value, or subtract `76561197960265728` from your Steam64 ID.

---

## Running

```bash
npm start
```

Steam must be running. The tool logs status changes to the console.
Press `Ctrl+C` to stop.

On first run (or when switching games for the first time), Steam will restart
automatically — this takes about 18 seconds. Subsequent starts with the same
game skip the restart entirely.

### Running in the background (Windows)

**Option A — minimise the terminal** (simplest).

**Option B — PM2:**

```bash
npm install -g pm2
pm2 start index.js --name switch-steam-status
pm2 save          # restart automatically on reboot
```

---

## File reference

| File | Purpose |
|---|---|
| `index.js` | Polling loop — ties Nintendo and Steam together |
| `nintendo.js` | NSO auth and friend presence fetching via nxapi |
| `steam.js` | shortcuts.vdf management, Steam restart, shortcut launch |
| `shortcuts-vdf.js` | Binary VDF parser/serializer + CRC32 appid formula |
| `keep-alive.mjs` | Dummy process Steam tracks as "in-game" |
| `.env` | Your credentials and paths (never commit this file) |
| `.env.example` | Template — copy to `.env` and fill in |

---

## Troubleshooting

**`[znca-api] Non-200 status code`**
- If `NXAPI_ZNCA_API_CLIENT_ID` is set in your `.env`, remove it. nxapi reads
  that env var directly and it overrides the internal auth, causing a 401 error.

**`[Steam] shortcuts.vdf not found`**
- Check `STEAM_PATH` and `STEAM_USER_ID` in `.env`.
- `STEAM_USER_ID` is the 32-bit account ID, not the full Steam64 ID.

**`Friend "…" not found in friends list`**
- `NSO_FRIEND_NAME` must match the Switch nickname character-for-character.
- The secondary account must have an accepted friend relationship with your
  main account on Nintendo Switch.

**Status shows for a moment then disappears**
- This was caused by Node.js v22+ exiting `keep-alive.mjs` immediately when
  the event loop drains. Already fixed in the current version.

**Game change not detected**
- NSO reports presence as `ONLINE` (not `PLAYING`) while actively gaming.
  Both states are handled.
- Make sure you are polling the correct friend name (`NSO_FRIEND_NAME`).
