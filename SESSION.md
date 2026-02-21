# Session notes — switch-steam-status

Paste this file into a new Claude Code chat to resume where we left off.

---

## What this project is

A Node.js background tool that polls Nintendo Switch Online (NSO) for the
current game being played on a main Switch account and mirrors that game title
to Steam Rich Presence via the Steamworks SDK.

---

## Stack

| Package | Role |
|---|---|
| `nxapi` | NSO auth + friend presence polling |
| `greenworks` | Node.js bindings for the Steamworks SDK (Rich Presence) |
| `dotenv` | Loads credentials from `.env` |

Project is **ESM** (`"type": "module"` in package.json). Node 18+ required.

---

## Files scaffolded (all complete)

```
switch-steam-status/
├── index.js          main polling loop (30 s interval)
├── nintendo.js       CoralApi auth, friend list, token-refresh on 401
├── steam.js          greenworks init, setGamePresence, clearPresence
├── .env.example      credential template
├── README.md         full setup guide
└── package.json      dependencies + scripts
```

`steam_appid.txt` is **auto-generated** at startup from the `STEAM_APP_ID`
env var — do not create it manually.

`steam_api64.dll` must be copied to the project root from the Steamworks SDK
(see README → step 3c).

---

## Key design decisions

- Secondary Nintendo account friends the main account because Nintendo's API
  only exposes **friends'** presence, not self-presence.
- nxapi's `CoralApi.createWithSessionToken(sessionToken)` is used
  programmatically (not the CLI). Token refresh is handled in nintendo.js by
  catching 401 / auth errors and re-calling createWithSessionToken.
- greenworks is loaded via `createRequire` (native CommonJS addon in an ESM
  project).
- Rich Presence is set with the `status` key:
  `greenworks.setRichPresence('status', gameName)`.
- State changes are tracked in `currentGame` (null = not playing) to avoid
  redundant Steamworks calls.

---

## .env variables

```
NSO_SESSION_TOKEN=   # session token for the secondary Nintendo account
NSO_FRIEND_NAME=     # exact Switch display name of the main account
STEAM_APP_ID=480     # 480 = Spacewar test app; replace with real ID later
```

---

## Setup status at time of save

- [ ] `npm install` run
- [ ] Steamworks SDK files copied into `node_modules/greenworks/deps/steamworks_sdk/`
- [ ] `steam_api64.dll` copied to project root
- [ ] `npm rebuild greenworks` succeeded
- [ ] `.env` created and filled in
- [ ] Nintendo session token obtained via `npx nxapi nintendo auth`
- [ ] NSO friend list sanity-check passed (secondary account sees main account)
- [ ] `npm start` tested successfully

---

## Nintendo session token how-to (already explained)

1. `npx nxapi nintendo auth` — prints a Nintendo login URL, waits for redirect
2. Open the URL, log in as the **secondary** account
3. After login, browser tries to open `npf71b963c1b7b6d119://auth#...` and
   fails — copy that full URL from the address bar
4. Paste it back into the terminal; nxapi prints the `session_token`
5. Set `NSO_SESSION_TOKEN=<token>` in `.env`
6. Sanity check: run the one-liner in README / chat to print the friends list

---

## Known uncertainties / things to verify

- `nxapi/coral` exports: code uses `import CoralApi from 'nxapi/coral'`
  (default export). If that fails, try `import { CoralApi } from 'nxapi/coral'`.
- `getFriendList()` return shape assumed to be `response.result.friendList[]`
  with each friend having `.name` and `.presence.state` / `.presence.game.name`.
  Adjust in `nintendo.js` if nxapi's installed version differs.
- greenworks `clearRichPresence()` is called first; if it throws, falls back
  to `setRichPresence('status', '')`.
