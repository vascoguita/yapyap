/**
 * The panel and the plugin's hidden page share an origin, so they talk over
 * a BroadcastChannel. Only the hidden page holds YapYap's host API; the
 * panel asks it for everything. Messages are checked on arrival, since
 * anything on the origin could post one.
 */
export const CHANNEL = 'yapyap-ai-assistant';

/** What the panel shows about the assistant's setup. */
export interface AssistantState {
  readonly type: 'state';
  readonly provider: string;
  readonly model: string;
  /**
   * What is missing before the assistant can ask: '', 'key', 'model' or
   * 'endpoint', or 'unavailable' when its settings could not be read.
   */
  readonly missing: string;
}

/** Exactly what would be sent about the open chat, once the user allowed it (#107). */
export interface Preview {
  readonly type: 'preview';
  readonly chat: string;
  readonly allowed: boolean;
  readonly instructions: string;
  readonly transcript: string;
}

/** The hidden page's other news for the panel. */
export type Update =
  | AssistantState
  | Preview
  | { readonly type: 'progress'; readonly text: string }
  | { readonly type: 'suggestions'; readonly items: readonly string[] }
  | { readonly type: 'used' }
  | { readonly type: 'problem'; readonly reason: string };

export type PanelRequest =
  | { readonly type: 'state?' }
  | { readonly type: 'save-key'; readonly key: string }
  | { readonly type: 'forget-key' }
  | { readonly type: 'prepare' }
  | { readonly type: 'allow-chat'; readonly allowed: boolean }
  | { readonly type: 'send' }
  | { readonly type: 'cancel' }
  | { readonly type: 'use'; readonly index: number };

/** Longer than any provider's keys. */
const MAX_KEY = 8192;

const SIMPLE: ReadonlySet<unknown> = new Set(['state?', 'forget-key', 'prepare', 'send', 'cancel']);

function saveKey(key: unknown): PanelRequest | undefined {
  const valid = typeof key === 'string' && key.trim() !== '' && key.length <= MAX_KEY;
  return valid ? { type: 'save-key', key: key.trim() } : undefined;
}

/** A request from the panel, or undefined for anything else. */
export function panelRequest(data: unknown): PanelRequest | undefined {
  const { type, key, allowed, index } = Object(data) as Record<string, unknown>;
  if (SIMPLE.has(type)) {
    return { type } as PanelRequest;
  }
  switch (type) {
    case 'save-key':
      return saveKey(key);
    case 'allow-chat':
      return typeof allowed === 'boolean' ? { type, allowed } : undefined;
    case 'use':
      return Number.isInteger(index) ? { type, index: index as number } : undefined;
    default:
      return undefined;
  }
}

/** The hidden page's answer, or undefined for anything else. */
export function assistantState(data: unknown): AssistantState | undefined {
  const { type, provider, model, missing } = Object(data) as Record<string, unknown>;
  const valid =
    type === 'state' &&
    typeof provider === 'string' &&
    typeof model === 'string' &&
    typeof missing === 'string';
  return valid ? { type, provider, model, missing } : undefined;
}

const strings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function preview(fields: Record<string, unknown>): Preview | undefined {
  const { chat, allowed, instructions, transcript } = fields;
  const valid =
    typeof chat === 'string' &&
    typeof allowed === 'boolean' &&
    typeof instructions === 'string' &&
    typeof transcript === 'string';
  return valid ? { type: 'preview', chat, allowed, instructions, transcript } : undefined;
}

/** How each kind of news is checked; a kind not listed is not news. */
const NEWS: Readonly<Record<string, (fields: Record<string, unknown>) => Update | undefined>> = {
  preview,
  state: assistantState,
  progress: ({ text }) => (typeof text === 'string' ? { type: 'progress', text } : undefined),
  suggestions: ({ items }) => (strings(items) ? { type: 'suggestions', items } : undefined),
  used: () => ({ type: 'used' }),
  problem: ({ reason }) => (typeof reason === 'string' ? { type: 'problem', reason } : undefined),
};

/** Anything the hidden page sends, or undefined for anything else. */
export function update(data: unknown): Update | undefined {
  const fields = Object(data) as Record<string, unknown>;
  const { type } = fields;
  return typeof type === 'string' && Object.hasOwn(NEWS, type) ? NEWS[type]?.(fields) : undefined;
}
