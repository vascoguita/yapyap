import { LANDMARKS } from './page-state.ts';

interface AvatarDocument {
  querySelector(selectors: string): unknown;
}

/**
 * The address of the account's own profile photo, from the profile button
 * at the bottom of WhatsApp's navigation bar (#87), or null while there is
 * none. Runs inside the page as source text, so it stays self-contained. It
 * reads that one image's address, never chats or names; the main process
 * checks the address before fetching it.
 */
export function readOwnAvatar(doc: AvatarDocument, selector: string): string | null {
  const image = doc.querySelector(selector) as { src?: unknown } | null;
  const src = image?.src;
  return typeof src === 'string' && /^https?:\/\//.test(src) ? src : null;
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`. */
export const OWN_AVATAR = `(${readOwnAvatar.toString()})(document, ${JSON.stringify(LANDMARKS.ownAvatar)})`;
