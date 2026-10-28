import type { StorageApi } from '@yapyap/extension-sdk';

/** Where the chats the user allowed are kept, by fingerprint. */
const ALLOWED = 'allowedChats';

/** The most chats remembered; the oldest are forgotten first. */
const MAX_ALLOWED = 500;

/**
 * A chat's fingerprint, so the extension's storage never holds the chat's
 * name, only a hash of it.
 */
export async function chatKey(name: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function allowedKeys(storage: Pick<StorageApi, 'get'>): Promise<string[]> {
  const saved = await storage.get(ALLOWED);
  return Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : [];
}

/** Whether the user allowed the assistant in the chat named `name`; nothing is, at first. */
export async function isAllowed(storage: Pick<StorageApi, 'get'>, name: string): Promise<boolean> {
  const keys = await allowedKeys(storage);
  return keys.includes(await chatKey(name));
}

/** Allows the assistant in the chat named `name`, or stops allowing it. */
export async function setAllowed(
  storage: Pick<StorageApi, 'get' | 'set'>,
  name: string,
  allowed: boolean,
): Promise<void> {
  const key = await chatKey(name);
  const keys = await allowedKeys(storage);
  const others = keys.filter((entry) => entry !== key);
  await storage.set(ALLOWED, allowed ? [...others, key].slice(-MAX_ALLOWED) : others);
}
