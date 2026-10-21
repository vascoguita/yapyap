import { classifyLink } from './link-policy.ts';

const WA_ME_PATH = /^\/(\d{1,20})?\/?$/;

function fromWaMe(url: URL, send: URL): string | undefined {
  const path = WA_ME_PATH.exec(url.pathname);
  if (path === null) {
    return undefined;
  }
  if (path[1] !== undefined) {
    send.searchParams.set('phone', path[1]);
  }
  return send.href;
}

function fromApi(url: URL, send: URL): string | undefined {
  if (url.pathname !== '/send') {
    return undefined;
  }
  const phone = url.searchParams.get('phone');
  if (phone !== null) {
    send.searchParams.set('phone', phone);
  }
  return send.href;
}

// A Map, so a host such as `constructor` cannot reach Object.prototype.
const WEB_FORMS: ReadonlyMap<string, (url: URL, send: URL) => string | undefined> = new Map([
  ['wa.me', fromWaMe],
  ['api.whatsapp.com', fromApi],
]);

/**
 * Rewrites the web forms of a chat link (`https://wa.me/<number>` and
 * `https://api.whatsapp.com/send`) as `whatsapp://send`, so every form goes
 * through the same validation. Only the phone number and text survive.
 */
function asSendLink(url: URL): string | undefined {
  if (url.protocol === 'whatsapp:') {
    return url.href;
  }
  const form = url.protocol === 'https:' ? WEB_FORMS.get(url.host) : undefined;
  if (form === undefined) {
    return undefined;
  }
  const send = new URL('whatsapp://send');
  const text = url.searchParams.get('text');
  if (text !== null) {
    send.searchParams.set('text', text);
  }
  return form(url, send);
}

/**
 * Where a chat link handed to YapYap by the operating system opens, on
 * `home`, or nothing if it is not a valid chat link.
 */
export function chatLinkTarget(raw: string, home: string): string | undefined {
  const send = URL.canParse(raw) ? asSendLink(new URL(raw)) : undefined;
  const action = send === undefined ? undefined : classifyLink(send, home);
  return action?.kind === 'deep-link' ? action.url : undefined;
}

/** The first chat link on a command line, as a target on `home`. */
export function chatLinkInArguments(argv: readonly string[], home: string): string | undefined {
  for (const argument of argv) {
    const target = chatLinkTarget(argument, home);
    if (target !== undefined) {
      return target;
    }
  }
  return undefined;
}
