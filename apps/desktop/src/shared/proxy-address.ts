/**
 * What a proxy address may be: empty, or `http://`, `https://` or
 * `socks5://` with a host and an optional port. No user name or password,
 * which Proxy Sign-In asks for and keeps encrypted instead.
 */
export const PROXY_ADDRESS = String.raw`^$|^(https?|socks5)://[A-Za-z0-9.-]+(:\d{1,5})?/?$`;

/** Long enough for any host name. */
export const MAX_PROXY_ADDRESS = 255;

export function isProxyAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_PROXY_ADDRESS &&
    new RegExp(PROXY_ADDRESS).test(value)
  );
}
