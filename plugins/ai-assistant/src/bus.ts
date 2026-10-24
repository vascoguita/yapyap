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

export type PanelRequest =
  | { readonly type: 'state?' }
  | { readonly type: 'save-key'; readonly key: string }
  | { readonly type: 'forget-key' };

/** Longer than any provider's keys. */
const MAX_KEY = 8192;

/** A request from the panel, or undefined for anything else. */
export function panelRequest(data: unknown): PanelRequest | undefined {
  const { type, key } = Object(data) as Record<string, unknown>;
  if (type === 'state?' || type === 'forget-key') {
    return { type };
  }
  const valid = type === 'save-key' && typeof key === 'string' && key.trim() !== '';
  return valid && key.length <= MAX_KEY ? { type: 'save-key', key: key.trim() } : undefined;
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
