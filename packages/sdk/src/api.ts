/**
 * The typed API a plugin receives from YapYap (ADR 0004). Each method needs
 * the capability named in its documentation; calling it without the grant
 * rejects with a {@link PluginError} of kind `not-granted`. There is no way
 * to send a message: plugins can only insert drafts the user sends.
 */

/** Why a host call failed. */
export type PluginErrorKind = 'not-granted' | 'invalid' | 'rate-limited' | 'timeout' | 'failed';

/** The error every rejected host call carries. */
export interface PluginError {
  /** What went wrong, for the plugin to handle. */
  readonly kind: PluginErrorKind;
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
}

/** Native notifications attributed to the plugin. */
export interface NotificationsApi {
  /** Shows a notification with the plugin's name. Needs `notifications:show`. */
  readonly show: (notification: { readonly title: string; readonly body: string }) => Promise<void>;
}

/** A small key-value store private to the plugin. */
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

/** The plugin's settings, which the user fills in the form the manifest declares. */
export interface SettingsApi {
  /**
   * The values the user saved, keyed by the setting's name in
   * `contributes.settings`. A setting the user never saved is missing, so
   * the plugin uses its own default. Needs no capability.
   */
  readonly get: () => Promise<Readonly<Record<string, SettingValue>>>;
}

/** Commands contributed in the manifest. */
export interface CommandsApi {
  /** Runs `handler` when the user picks the command with this manifest `id`. */
  readonly onRun: (id: string, handler: () => void | Promise<void>) => void;
}

/** Everything a plugin can reach. HTTPS requests use the standard `fetch`, limited to `network.hosts`. */
export interface PluginHost {
  /** Reading chats. */
  readonly chat: ChatApi;
  /** Writing drafts. */
  readonly composer: ComposerApi;
  /** Notifications. */
  readonly notifications: NotificationsApi;
  /** Private key-value storage. */
  readonly storage: StorageApi;
  /** Encrypted secrets. */
  readonly secrets: SecretsApi;
  /** Contributed commands. */
  readonly commands: CommandsApi;
  /** The plugin's own settings. */
  readonly settings: SettingsApi;
}

/** What a plugin's entry module exports as its default. */
export interface Plugin {
  /** Runs when the plugin starts, with the host API. */
  readonly activate: (host: PluginHost) => void | Promise<void>;
  /** Runs before the plugin stops, to release what it holds. */
  readonly deactivate?: () => void | Promise<void>;
}

/** Declares a plugin, with types: `export default definePlugin({ activate(host) { … } })`. */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}
