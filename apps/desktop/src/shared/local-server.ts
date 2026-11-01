/**
 * A model server on this computer, as the assistant's settings keep it:
 * an OpenAI-style `/v1` address on loopback, or empty for none. Nothing
 * else on the network can be named, so a settings file cannot point the
 * assistant's chats anywhere else (ADR 0017).
 */
export const LOCAL_SERVER = String.raw`^(?:https?://(?:localhost|127\.0\.0\.1|\[::1\]):\d{1,5}/v1)?$`;

const PATTERN = new RegExp(LOCAL_SERVER);

/** Whether `address` is a server on this computer the assistant may use; a port past 65535 does not parse. */
export function isLocalServer(address: string): boolean {
  if (address === '' || !PATTERN.test(address) || !URL.canParse(address)) {
    return false;
  }
  return Number(new URL(address).port) > 0;
}

/**
 * The address the user typed, as the settings keep it: `localhost:11434`
 * or `http://localhost:11434/` become `http://localhost:11434/v1`.
 * Undefined when it is no server on this computer.
 */
export function localServerOf(typed: string): string | undefined {
  let trimmed = typed.trim();
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  const scheme = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  const address = scheme.endsWith('/v1') ? scheme : `${scheme}/v1`;
  return isLocalServer(address) ? address : undefined;
}
