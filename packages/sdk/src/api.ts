/**
 * The typed API an extension receives from YapYap (ADR 0004). Each method needs
 * the capability named in its documentation; calling it without the grant
 * rejects with a {@link ExtensionError} of kind `not-granted`. There is no way
 * to send a message: extensions can only insert drafts the user sends.
 */

/** Why a host call failed. */
export type ExtensionErrorKind = 'not-granted' | 'invalid' | 'rate-limited' | 'timeout' | 'failed';

/** The error every rejected host call carries. */
export interface ExtensionError {
  /** What went wrong, for the extension to handle. */
  readonly kind: ExtensionErrorKind;
  /** A short explanation, never containing chat content. */
  readonly message: string;
}

/** A message as plain data; YapYap never hands out DOM nodes or HTML. */
export interface ChatMessage {
  /** Whether the account's user sent it. */
  readonly outgoing: boolean;
  /** The text, as WhatsApp shows it. */
  readonly text: string;
  /** When it was sent, in milliseconds since the epoch, when WhatsApp shows it. */
  readonly sentAt?: number;
}

/** The open chat, as the adapter reads it. */
export interface ActiveChat {
  /** The chat's display name. */
  readonly name: string;
  /** Whether the chat is a group. */
  readonly group: boolean;
  /** Its most recent messages, oldest first, capped by the user's setting. */
  readonly messages: readonly ChatMessage[];
}

/** A chat with unread messages. */
export interface UnreadChat {
  /** The chat's display name. */
  readonly name: string;
  /** How many messages are unread. */
  readonly unread: number;
  /** The most recent unread messages, oldest first, capped by the user's setting. */
  readonly messages: readonly ChatMessage[];
}

/** Reading chats. */
export interface ChatApi {
  /** The open chat, or null when none is open. Needs `chat:read-active`. */
  readonly readActive: () => Promise<ActiveChat | null>;
  /** Every chat with unread messages. Needs `chat:read-unread-summary`. */
  readonly readUnreadSummary: () => Promise<readonly UnreadChat[]>;
}

/** Writing into the composer, never sending. */
export interface ComposerApi {
  /** Puts `text` in the open chat's composer for the user to edit and send. Needs `composer:insert-draft`. */
  readonly insertDraft: (text: string) => Promise<void>;
  /**
   * Replaces what the user typed in the open chat's composer with `text`, as
   * a rewritten draft for them to edit and send. Needs `composer:insert-draft`.
   */
  readonly replaceDraft: (text: string) => Promise<void>;
  /**
   * What the user typed in the open chat's composer so far, or null when no
   * chat is open. Needs `composer:read-draft`.
   */
  readonly readDraft: () => Promise<string | null>;
}

/** Native notifications attributed to the extension. */
export interface NotificationsApi {
  /** Shows a notification with the extension's name. Needs `notifications:show`. */
  readonly show: (notification: { readonly title: string; readonly body: string }) => Promise<void>;
}

/** A small key-value store private to the extension. */
export interface StorageApi {
  /** The stored JSON value, or undefined. Needs `storage:local`. */
  readonly get: (key: string) => Promise<unknown>;
  /** Stores a JSON value; fails once the store would pass 1 MiB. Needs `storage:local`. */
  readonly set: (key: string, value: unknown) => Promise<void>;
  /** Removes a key. Needs `storage:local`. */
  readonly delete: (key: string) => Promise<void>;
}

/** Secrets, such as API keys, encrypted by the operating system. */
export interface SecretsApi {
  /** The secret, or undefined. Needs `secrets:own`. */
  readonly get: (name: string) => Promise<string | undefined>;
  /** Stores a secret. Needs `secrets:own`. */
  readonly set: (name: string, value: string) => Promise<void>;
  /** Removes a secret. Needs `secrets:own`. */
  readonly delete: (name: string) => Promise<void>;
}

/** A setting's value, as the settings form in the manifest allows it. */
export type SettingValue = string | number | boolean;

/** The extension's settings, which the user fills in the form the manifest declares. */
export interface SettingsApi {
  /**
   * The values the user saved, keyed by the setting's name in
   * `contributes.settings`. A setting the user never saved is missing, so
   * the extension uses its own default. Needs no capability.
   */
  readonly get: () => Promise<Readonly<Record<string, SettingValue>>>;
}

/** Commands contributed in the manifest. */
export interface CommandsApi {
  /** Runs `handler` when the user picks the command with this manifest `id`. */
  readonly onRun: (id: string, handler: () => void | Promise<void>) => void;
}

/**
 * What the user asked for in YapYap's assistant bar (ADR 0013): reply
 * suggestions for the open chat, a message written from their own words,
 * or permission the extension asked for in its last offer.
 */
export type AssistantRequest =
  | { readonly type: 'suggest' }
  | { readonly type: 'prompt'; readonly text: string }
  | { readonly type: 'confirm' }
  | { readonly type: 'choose'; readonly value: string };

/** One option of an {@link AssistantChoice}. */
export interface AssistantOption {
  /** What is saved when the user picks it, at most 100 characters. */
  readonly value: string;
  /** What the user sees, at most 60 characters. */
  readonly label: string;
}

/**
 * A choice the bar shows beside the suggestions, such as the model in use
 * (#467). When the user picks an option, YapYap sends a `choose` request
 * with its value, and asks for suggestions again if some were showing.
 */
export interface AssistantChoice {
  /** A short name for the choice, at most 40 characters, such as "Model". */
  readonly label: string;
  /** The value in use now, at most 100 characters. */
  readonly current: string;
  /** Up to 20 options. */
  readonly options: readonly AssistantOption[];
}

/** What an extension shows in the assistant bar, as plain text under its name. */
export interface AssistantOffer {
  /** Up to five suggestions, each at most 1,000 characters. */
  readonly suggestions: readonly string[];
  /** A short status line, at most 200 characters, such as "Thinking…" or an error. */
  readonly status?: string;
  /**
   * The label of a button that sends a `confirm` request, at most 40
   * characters, such as "Allow here" when the extension needs the user's
   * permission first.
   */
  readonly confirm?: string;
  /** A choice to show, such as the model in use; the bar keeps the last one until another comes. */
  readonly choice?: AssistantChoice;
}

/**
 * YapYap's assistant bar above the open chat's message box (ADR 0013). Needs
 * `assistant:bar`. The extension only offers text: YapYap puts a suggestion in
 * the message box, or sends it, only when the user clicks.
 */
export interface AssistantApi {
  /** Replaces what the bar shows for this extension. */
  readonly offer: (offer: AssistantOffer) => Promise<void>;
  /** Runs `handler` for each request the user makes in the bar. */
  readonly onRequest: (handler: (request: AssistantRequest) => void | Promise<void>) => void;
}

/** Where the call on screen stands, as an extension with `calls:record` sees it. */
export interface CallState {
  /**
   * Whether YapYap can record calls on this system. It cannot yet on macOS,
   * where capturing the call's sound is not verified.
   */
  readonly supported: boolean;
  /** Whether a call is running for the account on screen. */
  readonly call: boolean;
  /** When the recording running now started, as an ISO date; null while nothing records. */
  readonly recordingSince: string | null;
}

/** A finished recording, as an extension may know it: never its file or its sound. */
export interface CallRecording {
  /** An opaque ID, for {@link CallsApi.reveal}. */
  readonly id: string;
  /** When it started, as an ISO date. */
  readonly started: string;
  readonly durationMs: number;
}

/**
 * Recording the call on screen (ADR 0015), with `calls:record`. YapYap
 * records, never the extension: the extension asks, YapYap asks the user in a
 * window of its own, and only the user's click starts a recording. The
 * extension never receives the sound, the file or its path.
 */
export interface CallsApi {
  /**
   * Asks YapYap to offer recording the call on screen. Resolves with
   * `recording` once the user chose **Record**, `declined` if they did not,
   * `no-call` when no call is running, and `unsupported` where YapYap
   * cannot record calls (see {@link CallState.supported}).
   */
  readonly record: () => Promise<'recording' | 'declined' | 'no-call' | 'unsupported'>;
  /** Stops the recording running now, if any. */
  readonly stop: () => Promise<void>;
  readonly state: () => Promise<CallState>;
  /** The recordings YapYap made, newest first. */
  readonly recordings: () => Promise<readonly CallRecording[]>;
  /** Shows a recording in the system's file manager. */
  readonly reveal: (id: string) => Promise<void>;
}

/** A model server running on this computer, as {@link LocalModelsApi.find} found it. */
export interface LocalModelServer {
  /** The server as `host:port`, such as `localhost:11434`, as YapYap names it when it asks the user. */
  readonly server: string;
  /** Its OpenAI-compatible address, such as `http://localhost:11434/v1`. */
  readonly endpoint: string;
  /** The IDs of up to 20 models it serves, each at most 200 characters, in the server's own order. */
  readonly models: readonly string[];
}

/**
 * Finding the AI models the user already runs on this computer (#456),
 * with `local-network`. YapYap looks, never the extension, and only at the
 * usual addresses of a few model servers.
 */
export interface LocalModelsApi {
  /**
   * The model servers that answer on this computer, at most four, among the
   * usual addresses of Ollama (port 11434), Alpaca (11435), LM Studio (1234)
   * and llama.cpp (8080). YapYap asks each only for its list of models.
   * Needs `local-network`.
   *
   * The first call asks the user whether the extension may look, and YapYap
   * remembers the answer: after a refusal, every call rejects with
   * `not-granted` without asking again, until the user takes
   * `local-network` back from the extension and grants it again. The call
   * waits for the user's answer, up to two minutes.
   *
   * Finding a server does not let the extension use it: its first request
   * to the server still asks the user, as for any server on this computer.
   */
  readonly find: () => Promise<readonly LocalModelServer[]>;
}

/** Everything an extension can reach. HTTPS requests use the standard `fetch`, limited to `network.hosts`. */
export interface ExtensionHost {
  /** Reading chats. */
  readonly chat: ChatApi;
  /** Writing drafts. */
  readonly composer: ComposerApi;
  /** Notifications. */
  readonly notifications: NotificationsApi;
  /** Recording calls, which YapYap does on the user's click (ADR 0015). */
  readonly calls: CallsApi;
  /** Private key-value storage. */
  readonly storage: StorageApi;
  /** Encrypted secrets. */
  readonly secrets: SecretsApi;
  /** Contributed commands. */
  readonly commands: CommandsApi;
  /** The extension's own settings. */
  readonly settings: SettingsApi;
  /** YapYap's assistant bar above the open chat's message box. */
  readonly assistant: AssistantApi;
  /** The AI models running on this computer, which YapYap looks for on the extension's behalf. */
  readonly localModels: LocalModelsApi;
}

/** What an extension's entry module exports as its default. */
export interface Extension {
  /** Runs when the extension starts, with the host API. */
  readonly activate: (host: ExtensionHost) => void | Promise<void>;
  /** Runs before the extension stops, to release what it holds. */
  readonly deactivate?: () => void | Promise<void>;
}

/** Declares an extension, with types: `export default defineExtension({ activate(host) { … } })`. */
export function defineExtension(extension: Extension): Extension {
  return extension;
}
