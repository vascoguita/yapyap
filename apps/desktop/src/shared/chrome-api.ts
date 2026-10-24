import type { SettingValue } from './settings-fields.ts';
import type { Shortcut } from './shortcuts.ts';

/** What the About window shows; built in main, rendered by the chrome renderer. */
export interface AboutInfo {
  readonly name: string;
  readonly version: string;
  readonly channel: string;
  readonly electron: string;
  readonly chromium: string;
  readonly node: string;
  readonly os: string;
  readonly license: string;
  /** The rendering mode, such as software rendering in safe mode. */
  readonly graphics: string;
}

/** Why WhatsApp is not showing, as the recovery screen explains it. */
export interface RecoveryProblem {
  readonly kind: 'unsupported' | 'blank' | 'load-failed' | 'crashed';
  readonly description: string;
}

/** The settings window's view of the settings. */
export interface SettingsSnapshot {
  /** Keyed by field ID, for the fields in `SETTING_FIELDS`. */
  readonly values: Readonly<Record<string, SettingValue>>;
  /** A changed setting only takes effect after a restart. */
  readonly restartPending: boolean;
  /** The settings belong to a newer YapYap, so changes cannot be saved. */
  readonly readOnly: boolean;
  /** Why the last change of a field did not take effect, keyed by field ID. */
  readonly problems: Readonly<Record<string, string>>;
}

/** How an export or import ended, with what to tell the user. */
export interface TransferResult {
  readonly outcome: 'done' | 'cancelled' | 'failed';
  /** Empty when there is nothing to say, as after a cancel. */
  readonly message: string;
}

/** A screen or window the user can share, with a small preview. */
export interface PickerSource {
  readonly id: string;
  readonly name: string;
  readonly kind: 'screen' | 'window';
  /** A `data:` image URL. */
  readonly thumbnail: string;
}

/** What the screen-sharing picker offers. */
export interface PickerOffer {
  readonly sources: readonly PickerSource[];
  /** Whether system audio can be shared too (Windows only). */
  readonly offerAudio: boolean;
}

/** An account as the sidebar shows it. */
export interface SidebarAccount {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** Unread chats, from WhatsApp's title; a muted account shows none. */
  readonly unread: number;
  readonly muted: boolean;
  readonly active: boolean;
  /** Sharing a screen or window right now, which the sidebar always shows (#161). */
  readonly sharing: boolean;
}

/** What the sidebar shows: the running accounts and how to lay them out. */
export interface SidebarState {
  readonly accounts: readonly SidebarAccount[];
  /** Avatars only, in a narrow strip. */
  readonly compact: boolean;
  readonly doNotDisturb: boolean;
}

/**
 * Who vouches for a plugin: YapYap's own key, another author's key the user
 * pins on first install, or nobody (Developer Mode only).
 */
export type PluginTrust = 'first-party' | 'third-party' | 'developer';

/** Grants a plugin asks for: capabilities, and network hosts one by one. */
interface PluginGrants {
  readonly capabilities: readonly string[];
  readonly hosts: readonly string[];
}

/** What the consent window shows before a plugin is installed or updated (ADR 0004). */
export interface PluginConsent extends PluginGrants {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: { readonly name: string; readonly url: string | null };
  /** The signing key's fingerprint; null for an unsigned plugin. */
  readonly fingerprint: string | null;
  readonly trust: PluginTrust;
  /** An update to an installed plugin, which asks only because it wants more. */
  readonly update: boolean;
  /** On an update, what it asks for that was not granted before. */
  readonly added: PluginGrants;
}

/** An installed plugin, as the Plugins window lists it. */
export interface InstalledPlugin {
  readonly id: string;
  readonly version: string;
  readonly trust: PluginTrust;
}

export interface PluginList {
  readonly plugins: readonly InstalledPlugin[];
  readonly developerMode: boolean;
}

/** The API the chrome preload exposes as `window.yapyap`, one function per operation. */
export interface ChromeApi {
  readonly about: {
    readonly info: () => Promise<AboutInfo>;
    readonly copyTechnicalDetails: () => Promise<void>;
  };
  readonly recovery: {
    readonly problem: () => Promise<RecoveryProblem | null>;
    readonly retry: () => Promise<void>;
    readonly clearCache: () => Promise<void>;
    readonly copyDiagnostics: () => Promise<void>;
  };
  readonly settings: {
    readonly get: () => Promise<SettingsSnapshot>;
    readonly set: (id: string, value: SettingValue) => Promise<SettingsSnapshot>;
    readonly restart: () => Promise<void>;
    readonly export: () => Promise<TransferResult>;
    readonly import: () => Promise<TransferResult>;
  };
  readonly chat: {
    /** Opens the chat with an international number; false when WhatsApp cannot yet. */
    readonly openNumber: (number: string) => Promise<boolean>;
  };
  readonly accounts: {
    readonly list: () => Promise<AccountList>;
    /** Null when YapYap refused the change, such as turning off the last running account. */
    readonly save: (id: string, change: AccountChange) => Promise<AccountList | null>;
    /** Asks the user first, so the list may come back unchanged. */
    readonly remove: (id: string) => Promise<AccountList>;
    /** `audio` and `video` the account was allowed until YapYap quits; null while it is off. */
    readonly permissions: (id: string) => Promise<readonly string[] | null>;
    readonly forgetPermissions: (id: string) => Promise<readonly string[] | null>;
  };
  readonly sidebar: {
    readonly state: () => Promise<SidebarState>;
    readonly switchTo: (id: string) => Promise<void>;
    readonly setCompact: (compact: boolean) => Promise<void>;
    readonly stopSharing: (id: string) => Promise<void>;
    /** YapYap sends the new state whenever it changes; the page never asks what to listen to. */
    readonly onState: (listener: (state: SidebarState) => void) => void;
  };
  readonly plugins: {
    readonly list: () => Promise<PluginList>;
    /** The pending install this consent window asks about. */
    readonly consent: () => Promise<PluginConsent>;
    /** `acknowledged`: the user accepted the risk of a plugin YapYap has not reviewed. */
    readonly answer: (install: boolean, acknowledged: boolean) => Promise<void>;
  };
  readonly report: {
    /** The sanitized diagnostics the report would carry, for the user to review. */
    readonly diagnostics: () => Promise<string>;
    /** Copies the report and opens GitHub's form with it; YapYap itself sends nothing. */
    readonly open: (description: string) => Promise<void>;
  };
  readonly picker: {
    readonly offer: () => Promise<PickerOffer>;
    readonly choose: (id: string, audio: boolean) => Promise<void>;
    readonly cancel: () => Promise<void>;
  };
  readonly shortcuts: {
    readonly list: () => Promise<ShortcutList>;
  };
}

/** The shortcuts of the platform YapYap runs on, with its own keys. */
export interface ShortcutList {
  readonly platform: string;
  readonly shortcuts: readonly Shortcut[];
}

/** An account as YapYap's own windows and menus show it. */
export interface AccountSummary {
  readonly id: string;
  readonly name: string;
  /** One of {@link AccountList.colors}. */
  readonly color: string;
  /** An account that is off keeps its data but runs no WhatsApp. */
  readonly enabled: boolean;
  /** A muted account shows no notifications and plays no sounds while out of sight. */
  readonly muted: boolean;
  /** The account the main window shows. */
  readonly active: boolean;
}

export interface AccountList {
  readonly accounts: readonly AccountSummary[];
  /** The colors an account can take, in the order to offer them. */
  readonly colors: readonly string[];
}

/** What the Accounts window can change about an account. */
export interface AccountChange {
  readonly name: string;
  readonly color: string;
  readonly enabled: boolean;
  readonly muted: boolean;
}

export const CHROME_CHANNELS = {
  aboutInfo: 'about:info',
  copyTechnicalDetails: 'about:copy-technical-details',
  recoveryProblem: 'recovery:problem',
  recoveryRetry: 'recovery:retry',
  recoveryClearCache: 'recovery:clear-cache',
  recoveryCopyDiagnostics: 'recovery:copy-diagnostics',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsRestart: 'settings:restart',
  settingsExport: 'settings:export',
  settingsImport: 'settings:import',
  pickerOffer: 'picker:offer',
  pickerChoose: 'picker:choose',
  pickerCancel: 'picker:cancel',
  chatOpenNumber: 'chat:open-number',
  accountsList: 'accounts:list',
  accountsSave: 'accounts:save',
  accountsRemove: 'accounts:remove',
  accountsPermissions: 'accounts:permissions',
  accountsForgetPermissions: 'accounts:forget-permissions',
  sidebarState: 'sidebar:state',
  sidebarSwitch: 'sidebar:switch',
  sidebarSetCompact: 'sidebar:set-compact',
  sidebarStopSharing: 'sidebar:stop-sharing',
  reportDiagnostics: 'report:diagnostics',
  reportOpen: 'report:open',
  pluginsList: 'plugins:list',
  pluginsConsent: 'plugins:consent',
  pluginsAnswer: 'plugins:answer',
  shortcutsList: 'shortcuts:list',
} as const;

/** The one channel YapYap sends on, from the main process to the sidebar. */
export const SIDEBAR_STATE_EVENT = 'sidebar:state-changed';
