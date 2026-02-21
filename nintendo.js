/**
 * nintendo.js — Nintendo Switch Online presence via nxapi
 *
 * Uses the secondary account's session token to poll the friend list and
 * return the presence object for the configured main account friend.
 *
 * nxapi API note: if a method or import path changes across nxapi versions,
 * check https://github.com/samuelthomas2774/nxapi for the current API surface.
 */

import CoralApi from 'nxapi/coral';
import { addUserAgent, setClientAuthentication } from 'nxapi';

// nxapi requires an identifying user-agent string for third-party API calls.
// When used as a library (not via the CLI), this must be set programmatically.
addUserAgent(process.env.NXAPI_USER_AGENT ?? 'switch-steam-status/1.0.0');

// Since June 2025, nxapi-znca-api.fancy.org.uk requires OAuth client authentication.
// Register a free client at https://nxapi-auth.fancy.org.uk/oauth/clients
// and set NXAPI_ZNCA_API_CLIENT_ID in .env.
//
// Note: do NOT use ClientAssertionProvider from the nxapi internal dist path —
// the npm package omits the signing key (release=null), so JWTs are signed with
// 32 zero bytes and are rejected by nxapi-auth with a non-200 response.
{
  const clientId = process.env.NXAPI_ZNCA_API_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      '[Nintendo] NXAPI_ZNCA_API_CLIENT_ID is not set.\n' +
      '  Register a free client at https://nxapi-auth.fancy.org.uk/oauth/clients\n' +
      '  then add NXAPI_ZNCA_API_CLIENT_ID=<your-client-id> to .env'
    );
  }
  setClientAuthentication({ id: clientId, scope: 'ca:gf ca:er ca:dr' });
}

let client = null;
let sessionToken = null;
let targetFriendName = null;

/**
 * Authenticate with Nintendo's Coral API and store the client instance.
 * Called once at startup and again automatically on token expiry.
 */
async function authenticate() {
  console.log('[Nintendo] Authenticating with NSO...');
  // createWithSessionToken exchanges the long-lived session token for a
  // short-lived Coral API token. The returned `nso` object is a CoralApi
  // instance ready for API calls.
  const { nso } = await CoralApi.createWithSessionToken(sessionToken);
  client = nso;
  console.log('[Nintendo] Authenticated successfully');
}

/**
 * @param {string} token      NSO_SESSION_TOKEN from .env
 * @param {string} friendName NSO_FRIEND_NAME from .env (exact Switch display name)
 */
export async function initNintendo(token, friendName) {
  sessionToken = token;
  targetFriendName = friendName;
  await authenticate();
}

/**
 * Fetch the target friend's presence from the Nintendo Switch Online friends list.
 *
 * Returns a presence object shaped like:
 *   { state: 'PLAYING' | 'ONLINE' | 'OFFLINE', game?: { name, sysDescription, … } }
 * Returns null if the friend is not found in the list.
 *
 * @returns {Promise<object|null>}
 */
export async function getFriendPresence() {
  if (!client) throw new Error('[Nintendo] Client not initialized — call initNintendo() first');

  let friendList;

  try {
    const response = await client.getFriendList();
    friendList = response.friends;
  } catch (err) {
    // The Coral API token expires periodically (usually after a few hours).
    // Detect auth failures and transparently re-authenticate.
    const isAuthError =
      err.status === 401 ||
      err.errorCode === 'TOKEN_EXPIRED' ||
      /token|auth|unauthori[sz]ed|expired/i.test(err.message ?? '');

    if (isAuthError) {
      console.log('[Nintendo] Token expired — re-authenticating...');
      await authenticate();
      const response = await client.getFriendList();
      friendList = response.friends;
    } else {
      throw err;
    }
  }

  const friend = friendList.find((f) => f.name === targetFriendName);

  if (!friend) {
    console.warn(
      `[Nintendo] Friend "${targetFriendName}" not found in friends list.\n` +
        '  • Confirm NSO_FRIEND_NAME matches the Switch display name exactly.\n' +
        '  • Confirm the secondary account has accepted the friend request.'
    );
    return null;
  }

  return friend.presence ?? null;
}
