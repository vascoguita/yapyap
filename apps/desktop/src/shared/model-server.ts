/**
 * A model server that speaks OpenAI's API, as the assistant's settings keep
 * it (#627): an address the user named, on this computer, the home network
 * or the internet, or empty for none. Messages go to it, so plain `http://`
 * is allowed only where they never leave the user's own network: this
 * computer and the private address ranges (RFC 1918), or a `.local` name.
 * Anywhere else needs `https://`.
 */
const HOME_HOST = String.raw`(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[a-z\d-]+(?:\.[a-z\d-]+)*\.local)`;

const ANY_HOST = String.raw`(?:[a-z\d-]+(?:\.[a-z\d-]+)*|\[[\da-f:.]+\])`;

/** A port, then a path without a query, a fragment or a trailing slash. */
const REST = String.raw`(?::\d{1,5})?(?:/[^\s?#]*[^\s?#/])?`;

/** What the settings file may hold; {@link isModelServer} checks the rest. */
export const MODEL_SERVER = `^(?:https://${ANY_HOST}${REST}|http://${HOME_HOST}${REST})?$`;

const PATTERN = new RegExp(MODEL_SERVER);

const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;

/** Whether `address` is a server the assistant may use; the pattern leaves no room for a user or password. */
export function isModelServer(address: string): boolean {
  if (address === '' || !PATTERN.test(address) || !URL.canParse(address)) {
    return false;
  }
  return new URL(address).port !== '0';
}

/** Whether the server runs on this computer, so nothing sent to it leaves it. */
export function isOnThisComputer(address: string): boolean {
  return isModelServer(address) && LOOPBACK.test(new URL(address).hostname);
}

/** The address as the settings keep it, if it is one the assistant may use. */
function kept(address: string): string | undefined {
  if (!URL.canParse(address)) {
    return undefined;
  }
  const url = new URL(address);
  // A key goes in the key field, encrypted, never in an address the settings keep.
  if (url.username !== '' || url.password !== '') {
    return undefined;
  }
  let path = url.pathname;
  while (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  path = path === '' ? '/v1' : path;
  const normalized = `${url.protocol}//${url.host}${path}`;
  return isModelServer(normalized) ? normalized : undefined;
}

/**
 * The address the user typed, as the settings keep it: `localhost:11434`
 * becomes `http://localhost:11434/v1`, and an address with no scheme is
 * plain `http://` only where that is allowed, else `https://`. Undefined
 * when it is no server the assistant may use.
 */
export function modelServerOf(typed: string): string | undefined {
  const trimmed = typed.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    return kept(trimmed);
  }
  return kept(`http://${trimmed}`) ?? kept(`https://${trimmed}`);
}
