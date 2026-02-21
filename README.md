# switch-steam-status

Polls your Nintendo Switch Online presence and mirrors the current game title
to Steam Rich Presence. Steam friends see your Switch game as a sub-status
beneath the Steam app name.

---

## How it works

```
Secondary NSO account ──(nxapi)──▶ friends list ──▶ your main account's presence
                                                          │
                                                          ▼
                                              Steam Rich Presence (greenworks)
```

Because Nintendo's API only exposes **friends'** presence (not your own),
a secondary Nintendo account that is friends with your main account is required.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18 or later | `node --version` to check |
| Steam client | Must be running and logged in when the tool runs |
| Steamworks SDK | Downloaded from your Steamworks partner account |
| Visual Studio Build Tools (Windows) | Required to compile greenworks |
| Two Nintendo accounts | One main, one secondary (can be a free account) |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

> `npm install` will attempt to compile greenworks. It will fail if the
> Steamworks SDK is not in place yet — that is expected. Complete step 3
> first, then run `npm install` (or `npm rebuild greenworks`) again.

---

### 2. Configure environment variables

```bash
copy .env.example .env
```

Open `.env` and fill in the three values (details for each are in the
sections below).

---

### 3. Set up greenworks with the Steamworks SDK

greenworks is a native addon that binds to the Steamworks SDK. It must be
compiled against the SDK headers and requires the Steam API DLL at runtime.

#### 3a. Download the Steamworks SDK

1. Go to <https://partner.steamgames.com/downloads/list> and log in with
   your Steamworks partner account.
2. Download the latest **Steamworks SDK** zip and extract it anywhere.

#### 3b. Copy SDK files into greenworks

After `npm install` has run at least once, the `node_modules/greenworks/`
folder will exist. Copy the following from the extracted SDK:

```
sdk/public/                  →  node_modules/greenworks/deps/steamworks_sdk/public/
sdk/redistributable_bin/     →  node_modules/greenworks/deps/steamworks_sdk/redistributable_bin/
```

Your tree should look like:

```
node_modules/greenworks/deps/steamworks_sdk/
├── public/
│   └── steam/
│       ├── steam_api.h
│       └── … (other headers)
└── redistributable_bin/
    ├── win64/
    │   ├── steam_api64.dll
    │   └── steam_api64.lib
    └── …
```

#### 3c. Copy the runtime DLL to the project root

greenworks needs `steam_api64.dll` in the same directory as the running
process (or on the system PATH). Copy it from:

```
node_modules/greenworks/deps/steamworks_sdk/redistributable_bin/win64/steam_api64.dll
```

to the **project root** (next to `index.js`).

#### 3d. Build greenworks

Make sure **Visual Studio Build Tools** with the *Desktop development with C++*
workload is installed, then:

```bash
npm rebuild greenworks
```

If the build succeeds you will see a `.node` file under
`node_modules/greenworks/build/Release/`.

---

### 4. Get your Nintendo session token (secondary account)

The session token is a long-lived credential for the secondary Nintendo account.

```bash
npx nxapi nintendo auth
```

Follow the prompts — nxapi will open a Nintendo login URL. After you log in,
copy the `session_token` value from the output and paste it into
`NSO_FRIEND_NAME` in your `.env` file.

> **Security note:** treat the session token like a password. It grants full
> access to the Nintendo account. Keep it in `.env` and never commit it.

---

### 5. Find your main account's Switch display name

On your **main** Nintendo Switch:

1. Open **System Settings → Profile**.
2. Note the **Nickname** shown at the top. This is the exact string you need.

Set `NSO_FRIEND_NAME` in `.env` to this value (case-sensitive, exact match).

Also make sure the secondary account has sent (and your main account has
accepted) a friend request on Nintendo Switch before running the tool.

---

### 6. Choose a Steam App ID

| Scenario | `STEAM_APP_ID` value |
|---|---|
| Local testing (no Steamworks account needed) | `480` (Valve's Spacewar test app) |
| Production with your own game slot | Your real App ID |

With `480`, Steam will show you as **Playing Spacewar** with your Switch game
as the sub-status. Switch to your real App ID once everything is working.

---

## Running

```bash
npm start
```

Steam must be running. The tool will log status changes to the console.
Press `Ctrl+C` to stop.

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
| `steam.js` | greenworks initialisation and Rich Presence calls |
| `.env` | Your credentials (never commit this file) |
| `.env.example` | Template — commit this, not `.env` |
| `steam_appid.txt` | Auto-generated from `STEAM_APP_ID` at startup |
| `steam_api64.dll` | Runtime DLL — copy from Steamworks SDK (see step 3c) |

---

## Troubleshooting

**`Failed to load greenworks`**
- Confirm you ran `npm rebuild greenworks` after copying the SDK files.
- Confirm Visual Studio Build Tools (C++ workload) is installed.

**`Steam API initialisation failed`**
- Steam must be running and logged in before starting the tool.
- Check that `steam_appid.txt` was written correctly (the app creates it
  automatically from `STEAM_APP_ID`).

**`Friend "…" not found in friends list`**
- `NSO_FRIEND_NAME` must match the Switch nickname character-for-character.
- The secondary account must have an accepted friend relationship with the
  main account on Nintendo Switch.

**Rich Presence not visible to friends**
- With App ID 480, Steam may not forward Rich Presence to the friends list
  view depending on your Steam settings. Check **Steam → Friends & Chat →
  Settings → "Share my currently active game with friends"**.
- With your own App ID, make sure the app is not VAC-restricted and is
  properly set up in Steamworks.

**NSO token errors / re-authentication loops**
- The session token should not expire. If auth failures keep occurring,
  re-run `npx nxapi nintendo auth` to get a fresh token and update `.env`.
