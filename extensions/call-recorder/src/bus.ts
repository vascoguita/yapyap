import type { CallRecording, CallState } from '@yapyap/extension-sdk';

/**
 * The panel and the hidden page share an origin, so they talk over a
 * BroadcastChannel. Only the hidden page holds YapYap's host API. Messages
 * are checked on arrival, since anything on the origin could post one.
 */
export const CHANNEL = 'yapyap-call-recorder';

/** What the panel shows: the call, the recording, and the recordings so far. */
export interface Status extends CallState {
  readonly type: 'status';
  readonly recordings: readonly CallRecording[];
}

export type Request =
  | { readonly type: 'status?' }
  | { readonly type: 'record' }
  | { readonly type: 'stop' }
  | { readonly type: 'reveal'; readonly id: string };

const SIMPLE: ReadonlySet<unknown> = new Set(['status?', 'record', 'stop']);

/** A request from the panel, or undefined for anything else. */
export function request(data: unknown): Request | undefined {
  const { type, id } = Object(data) as { type?: unknown; id?: unknown };
  if (SIMPLE.has(type)) {
    return { type } as Request;
  }
  // YapYap's recording IDs are 32 hex digits; it checks them again itself.
  return type === 'reveal' && typeof id === 'string' && /^[0-9a-f]{32}$/.test(id)
    ? { type, id }
    : undefined;
}

const isRecording = (value: unknown): value is CallRecording => {
  const { id, started, durationMs } = Object(value) as Record<string, unknown>;
  return typeof id === 'string' && typeof started === 'string' && typeof durationMs === 'number';
};

const isState = ({ supported, call, recordingSince }: Record<string, unknown>): boolean =>
  typeof supported === 'boolean' &&
  typeof call === 'boolean' &&
  (recordingSince === null || typeof recordingSince === 'string');

/** The hidden page's status, or undefined for anything else. */
export function status(data: unknown): Status | undefined {
  const fields = Object(data) as Record<string, unknown>;
  const { type, recordings } = fields;
  const listed = Array.isArray(recordings) && recordings.every(isRecording);
  return type === 'status' && isState(fields) && listed ? (data as Status) : undefined;
}
