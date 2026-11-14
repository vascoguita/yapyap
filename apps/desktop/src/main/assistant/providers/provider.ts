/** One turn of the conversation a provider continues. */
interface Turn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

/** What the assistant asks a model for. */
export interface CompletionRequest {
  /** How the model should behave, such as "Suggest three short replies". */
  readonly instructions: string;
  readonly turns: readonly Turn[];
  /** Stops the request, as when the user closes the panel. */
  readonly signal?: AbortSignal;
}

/** What came back once the stream ended. */
export interface Completion {
  readonly text: string;
  /** The model stopped at its length limit, so the text may be cut short. */
  readonly truncated: boolean;
}

/** Why a request failed, worded for the user rather than a log. */
export type ProviderErrorKind =
  | 'auth'
  | 'rate-limited'
  | 'network'
  | 'timeout'
  | 'refused'
  | 'bad-request'
  | 'cancelled'
  | 'failed';

/**
 * A failed request. Its message is fixed text: never the provider's own
 * response, which can echo what was sent, and so the chat.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind) {
    super(`The AI provider request failed: ${kind}.`);
    this.name = 'ProviderError';
    this.kind = kind;
  }
}

/** A model the assistant can stream text from. */
export interface Provider {
  /** Streams the reply, calling `onText` with each piece as it arrives. */
  readonly complete: (
    request: CompletionRequest,
    onText: (text: string) => void,
  ) => Promise<Completion>;
}

/** How long one request may take, retries included, before it fails as `timeout`. */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Enough for a few suggested replies or a rewritten message. */
export const MAX_OUTPUT_TOKENS = 4096;
