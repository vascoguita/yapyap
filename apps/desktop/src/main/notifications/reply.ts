import {
  FOCUS_COMPOSER,
  parseDraft,
  READ_COMPOSER,
  SELECT_COMPOSER,
} from '../../adapter/composer.ts';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';

export interface ReplyContents {
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
  /** Typed into the focused element as the user's own input. */
  insertText(text: string): Promise<void>;
}

export interface ReplyDependencies {
  readonly wait: (ms: number) => Promise<void>;
  readonly warn: (message: string) => void;
}

/** WhatsApp opens the chat after the click; this gives it time, then a little more. */
const STEP_MS = 400;
const ATTEMPTS = 8;

/** The platforms whose notifications take an inline reply. */
export function supportsInlineReply(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

async function focused(contents: ReplyContents, code = FOCUS_COMPOSER): Promise<boolean> {
  const result = await contents
    .executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [{ code }])
    .catch(() => false);
  return result === true;
}

/**
 * Puts an extension's draft into the open chat's message box, as if typed,
 * for the user to edit and send (ADR 0004: extensions never send). False when
 * no chat is open to take it. The text is message content, so it is never
 * logged.
 */
export async function insertDraft(contents: ReplyContents, text: string): Promise<boolean> {
  if (!(await focused(contents))) {
    return false;
  }
  await contents.insertText(text);
  return true;
}

/**
 * Replaces what the user typed in the open chat's message box with `text`,
 * as if they typed it over a selection of all of it, for them to edit and
 * send. False when no chat is open. The text is never logged.
 */
export async function replaceDraft(contents: ReplyContents, text: string): Promise<boolean> {
  if (!(await focused(contents, SELECT_COMPOSER))) {
    return false;
  }
  await contents.insertText(text);
  return true;
}

/**
 * What the user typed in the open chat's message box, for an extension holding
 * `composer:read-draft`; null when no chat is open. It is message content,
 * so it is never logged.
 */
export async function readDraft(contents: ReplyContents): Promise<string | null> {
  const found = await contents.executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [
    { code: READ_COMPOSER },
  ]);
  const draft = parseDraft(found);
  if (draft === undefined) {
    throw new Error('The draft could not be read.');
  }
  return draft;
}

/**
 * Puts a reply typed in a notification into WhatsApp's own message box, as
 * a draft, once WhatsApp has opened the chat. YapYap never sends it: the
 * user sees which chat it is in and sends it themselves (ADR 0008, C22).
 * The text is message content, so it is never logged.
 */
export async function draftReply(
  contents: ReplyContents,
  text: string,
  deps: ReplyDependencies,
  attempt = 1,
): Promise<void> {
  await deps.wait(STEP_MS);
  if (await focused(contents)) {
    await contents.insertText(text);
    return;
  }
  if (attempt >= ATTEMPTS) {
    deps.warn('Could not put a notification reply in WhatsApp’s message box.');
    return;
  }
  await draftReply(contents, text, deps, attempt + 1);
}
