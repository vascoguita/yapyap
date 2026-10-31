import type { LocalAction } from './built-in/words.ts';
import { languageName, rewriteStyle, type RewriteStyle } from './rewrites.ts';

/**
 * The panel and the extension's hidden page share an origin, so they talk over
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
   * What is missing before the assistant can ask, such as 'key', or ''
   * once nothing is, or 'unavailable' when its settings could not be read.
   */
  readonly missing: string;
  /** Whether to offer finding a model on this computer, to someone who set nothing up (#456). */
  readonly search: boolean;
  /** The key request this state answers, so the panel knows it arrived. */
  readonly answers?: KeyRequest;
}

/** The panel's requests about the key, which it sends again until they are answered. */
export type KeyRequest = 'save-key' | 'forget-key';

const KEY_REQUESTS: ReadonlySet<unknown> = new Set<KeyRequest>(['save-key', 'forget-key']);

/** Exactly what would be sent about the open chat, once the user allowed it (#107). */
export interface Preview {
  readonly type: 'preview';
  readonly chat: string;
  readonly allowed: boolean;
  readonly instructions: string;
  readonly transcript: string;
}

/**
 * What the panel shows about the private model on this computer (#457):
 * how it stands, the button for what to do next, and the space it takes.
 */
export interface LocalView {
  readonly type: 'local';
  readonly status: string;
  /** The button's label, '' for none. */
  readonly label: string;
  readonly action: LocalAction | '';
  /** Bytes the model takes on this computer. */
  readonly used: number;
  /** The model's name, shown under Advanced. */
  readonly model: string;
}

/** The hidden page's other news for the panel. */
export type Update =
  | AssistantState
  | LocalView
  | Preview
  | { readonly type: 'progress'; readonly text: string }
  | {
      readonly type: 'suggestions';
      readonly items: readonly string[];
      /** A rewrite, which takes the draft's place, rather than replies to add to it. */
      readonly replace: boolean;
    }
  | { readonly type: 'summary'; readonly text: string }
  | { readonly type: 'used' }
  | { readonly type: 'problem'; readonly reason: string };

export type PanelRequest =
  | { readonly type: 'state?' }
  | { readonly type: 'save-key'; readonly key: string }
  | { readonly type: 'forget-key' }
  | { readonly type: 'find-model' }
  | { readonly type: 'download-model' }
  | { readonly type: 'smaller-model' }
  | { readonly type: 'remove-model' }
  | { readonly type: 'prepare' }
  | { readonly type: 'prepare-summary' }
  | { readonly type: 'prepare-rewrite'; readonly style: RewriteStyle; readonly language: string }
  | { readonly type: 'allow-chat'; readonly allowed: boolean }
  | { readonly type: 'send' }
  | { readonly type: 'cancel' }
  | { readonly type: 'use'; readonly index: number };

/** Longer than any provider's keys. */
const MAX_KEY = 8192;

const SIMPLE: ReadonlySet<unknown> = new Set([
  'state?',
  'forget-key',
  'find-model',
  'download-model',
  'smaller-model',
  'remove-model',
  'prepare',
  'prepare-summary',
  'send',
  'cancel',
]);

function saveKey(key: unknown): PanelRequest | undefined {
  const valid = typeof key === 'string' && key.trim() !== '' && key.length <= MAX_KEY;
  return valid ? { type: 'save-key', key: key.trim() } : undefined;
}

/** A rewrite request; a translation needs a language, the other styles none. */
function prepareRewrite(style: unknown, language: unknown): PanelRequest | undefined {
  const known = rewriteStyle(style);
  const name = languageName(language);
  if (known === undefined || (known === 'translate' && name === undefined)) {
    return undefined;
  }
  return { type: 'prepare-rewrite', style: known, language: name ?? '' };
}

/** A request from the panel, or undefined for anything else. */
export function panelRequest(data: unknown): PanelRequest | undefined {
  const { type, key, allowed, index, style, language } = Object(data) as Record<string, unknown>;
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
    case 'prepare-rewrite':
      return prepareRewrite(style, language);
    default:
      return undefined;
  }
}

/** The hidden page's answer, or undefined for anything else. */
export function assistantState(data: unknown): AssistantState | undefined {
  const { type, provider, model, missing, search, answers } = Object(data) as Record<
    string,
    unknown
  >;
  if (type !== 'state' || typeof search !== 'boolean') {
    return undefined;
  }
  const valid =
    typeof provider === 'string' && typeof model === 'string' && typeof missing === 'string';
  const answered = KEY_REQUESTS.has(answers) ? { answers: answers as KeyRequest } : {};
  return valid ? { type, provider, model, missing, search, ...answered } : undefined;
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

const ACTIONS: ReadonlySet<unknown> = new Set(['download', 'smaller', '']);

/** The private model's view, or undefined for anything else. */
function localView(fields: Record<string, unknown>): LocalView | undefined {
  const { status, label, action, used, model } = fields;
  const valid =
    typeof status === 'string' &&
    typeof label === 'string' &&
    ACTIONS.has(action) &&
    typeof used === 'number' &&
    typeof model === 'string';
  return valid
    ? { type: 'local', status, label, action: action as LocalView['action'], used, model }
    : undefined;
}

/** How each kind of news is checked; a kind not listed is not news. */
const NEWS: Readonly<Record<string, (fields: Record<string, unknown>) => Update | undefined>> = {
  preview,
  local: localView,
  state: assistantState,
  progress: ({ text }) => (typeof text === 'string' ? { type: 'progress', text } : undefined),
  suggestions: ({ items, replace }) =>
    strings(items) && typeof replace === 'boolean'
      ? { type: 'suggestions', replace, items }
      : undefined,
  summary: ({ text }) => (typeof text === 'string' ? { type: 'summary', text } : undefined),
  used: () => ({ type: 'used' }),
  problem: ({ reason }) => (typeof reason === 'string' ? { type: 'problem', reason } : undefined),
};

/** Anything the hidden page sends, or undefined for anything else. */
export function update(data: unknown): Update | undefined {
  const fields = Object(data) as Record<string, unknown>;
  const { type } = fields;
  return typeof type === 'string' && Object.hasOwn(NEWS, type) ? NEWS[type]?.(fields) : undefined;
}
