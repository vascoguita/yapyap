import type { SettingValue } from './settings-fields.ts';
import type { CustomCode } from './custom-code.ts';
import type { ActiveShortcut } from './shortcuts.ts';

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
  /** Fields shown but not changeable here, with the reason, keyed by field ID. */
  readonly unavailable: Readonly<Record<string, string>>;
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
  /** The account's WhatsApp profile photo as a data URL, once YapYap has read it (#87). */
  readonly avatar: string | undefined;
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
  /** What the user approved, and whether each grant still stands (#94). */
  readonly grants: readonly PluginGrant[];
  /** The plugin's settings form, with what the user saved; empty when it has none (#98). */
  readonly settings: readonly PluginSetting[];
}

/** One field of a plugin's settings form, as YapYap renders it. */
export interface PluginSetting {
  readonly key: string;
  readonly type: 'string' | 'number' | 'integer' | 'boolean';
  readonly title?: string;
  readonly description?: string;
  /** The values to choose from, when the plugin lists them. */
  readonly enum?: readonly (string | number)[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  /** Missing until the user saves one. */
  readonly value?: string | number | boolean;
}

/**
 * One capability or `network:<host>` the user approved: granted for the
 * whole plugin, or, for one that acts on an account, account by account.
 */
export interface PluginGrant {
  readonly capability: string;
  readonly granted: boolean;
  /** Set for a capability that acts on the account on screen. */
  readonly accounts?: readonly {
    readonly id: string;
    readonly name: string;
    readonly granted: boolean;
  }[];
}

export interface PluginList {
  readonly plugins: readonly InstalledPlugin[];
  readonly developerMode: boolean;
  /** What plugins asked YapYap to do, newest first; never what they sent or got. */
  readonly activity: readonly PluginActivity[];
}

/** One call a plugin made, by operation and outcome. */
export interface PluginActivity {
  readonly time: string;
  readonly plugin: string;
  readonly capability: string;
  readonly method: string;
  readonly outcome: 'ok' | 'invalid' | 'not-granted' | 'rate-limited' | 'timeout' | 'failed';
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
    /** Asks in the system's folder dialog; read the settings again afterwards. */
    readonly chooseFolder: (id: string) => Promise<void>;
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
  readonly quickPanel: {
    /** Switches to the account and brings YapYap's window back. */
    readonly open: (id: string) => Promise<void>;
    readonly setDoNotDisturb: (on: boolean) => Promise<void>;
  };
  readonly plugins: {
    readonly list: () => Promise<PluginList>;
    /** The pending install this consent window asks about. */
    readonly consent: () => Promise<PluginConsent>;
    /** `acknowledged`: the user accepted the risk of a plugin YapYap has not reviewed. */
    readonly answer: (install: boolean, acknowledged: boolean) => Promise<void>;
    /** Saves one setting of a plugin; null goes back to the plugin's own default. */
    readonly setSetting: (
      id: string,
      key: string,
      value: string | number | boolean | null,
    ) => Promise<PluginList>;
    /** Grants a capability again or takes it back: for one account, or the whole plugin with null. */
    readonly setGrant: (
      id: string,
      capability: string,
      account: string | null,
      granted: boolean,
    ) => Promise<PluginList>;
    /** Removes a plugin and everything it kept, once the user confirms (#332). */
    readonly remove: (id: string) => Promise<PluginList>;
    /** Calls `listener` whenever a plugin is installed, updated, removed or stopped (#342). */
    readonly onChange: (listener: () => void) => void;
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
    /** New keys for one shortcut, or null to go back to YapYap's own. */
    readonly set: (id: string, accelerator: string | null) => Promise<ShortcutChange>;
  };
  readonly downloads: {
    readonly list: () => Promise<readonly DownloadEntry[]>;
    readonly act: (id: number, action: DownloadAction) => Promise<void>;
    /** Forgets downloads that have ended; their files stay. */
    readonly clear: () => Promise<void>;
  };
  readonly spelling: {
    readonly languages: () => Promise<SpellingLanguages>;
    /** Every language must have a dictionary; an empty list means the system's language. */
    readonly choose: (languages: readonly string[]) => Promise<SpellingLanguages>;
  };
  readonly customCode: {
    readonly get: () => Promise<CustomCodeView>;
    /** Saves every scope at once; scopes that are not listed are dropped. */
    readonly save: (code: CustomCode) => Promise<CustomCodeView>;
    /** Shows unsaved CSS for one scope in its WhatsApp pages; null goes back to the saved CSS. */
    readonly preview: (scope: string, css: string | null) => Promise<void>;
  };
  readonly proxyLogin: {
    readonly request: () => Promise<ProxyLoginRequest>;
    /** Null cancels the sign-in. */
    readonly answer: (credentials: ProxyLoginAnswer | null) => Promise<void>;
  };
}

/** The custom code, and the scopes it can apply to: all accounts first, then each account. */
export interface CustomCodeView {
  readonly code: CustomCode;
  readonly scopes: readonly { readonly id: string; readonly label: string }[];
}

/** What the Downloads window can ask of one download. */
export type DownloadAction = 'pause' | 'resume' | 'cancel' | 'show';

export const DOWNLOAD_ACTIONS: readonly DownloadAction[] = ['pause', 'resume', 'cancel', 'show'];

/** One download of this session, as the Downloads window shows it. */
export interface DownloadEntry {
  readonly id: number;
  readonly name: string;
  readonly state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';
  readonly received: number;
  /** Zero when the server did not say. */
  readonly total: number;
  readonly canResume: boolean;
}

/** The shortcuts of the platform YapYap runs on, with its own keys. */
export interface ShortcutList {
  readonly platform: string;
  readonly shortcuts: readonly ActiveShortcut[];
  readonly global: readonly GlobalShortcutState[];
}

/** A shortcut that works from any app, and whether the system granted its keys. */
export interface GlobalShortcutState {
  readonly id: string;
  readonly label: string;
  /** Empty when it has no keys. */
  readonly accelerator: string;
  readonly registered: boolean;
}

/** The shortcuts after a change, and why it was refused; empty when it was not. */
export interface ShortcutChange extends ShortcutList {
  readonly problem: string;
}

/** How many spelling languages can be on at once; each one is a dictionary to load. */
export const MAX_SPELLING_LANGUAGES = 10;

/** What the Spelling Languages window shows. */
export interface SpellingLanguages {
  readonly enabled: boolean;
  /** The languages with a dictionary; empty on macOS, which picks languages itself. */
  readonly available: readonly string[];
  readonly chosen: readonly string[];
  /** What is checked now: the chosen languages, or the system's. */
  readonly inUse: readonly string[];
}

/** A proxy asking the user to sign in. */
export interface ProxyLoginRequest {
  readonly host: string;
  readonly port: number;
  /** The proxy refused the last username and password tried. */
  readonly failed: boolean;
  /** Whether this computer can keep the password encrypted. */
  readonly canRemember: boolean;
}

export interface ProxyLoginAnswer {
  readonly username: string;
  readonly password: string;
  readonly remember: boolean;
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
  /** The account's own proxy; empty uses Settings → Network. */
  readonly proxy: string;
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
  readonly proxy: string;
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
  settingsChooseFolder: 'settings:choose-folder',
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
  pluginsSetGrant: 'plugins:set-grant',
  pluginsSetSetting: 'plugins:set-setting',
  pluginsRemove: 'plugins:remove',
  shortcutsList: 'shortcuts:list',
  shortcutsSet: 'shortcuts:set',
  downloadsList: 'downloads:list',
  downloadsAct: 'downloads:act',
  downloadsClear: 'downloads:clear',
  spellingLanguages: 'spelling:languages',
  spellingChoose: 'spelling:choose',
  customCodeGet: 'custom-code:get',
  customCodeSave: 'custom-code:save',
  customCodePreview: 'custom-code:preview',
  quickPanelOpen: 'quick-panel:open',
  quickPanelSetDoNotDisturb: 'quick-panel:set-do-not-disturb',
  proxyLoginRequest: 'proxy-login:request',
  proxyLoginAnswer: 'proxy-login:answer',
} as const;

/** The one channel YapYap sends on, from the main process to the sidebar. */
export const SIDEBAR_STATE_EVENT = 'sidebar:state-changed';

/** Tells an open Plugins window that the installed plugins changed (#342). */
export const PLUGINS_CHANGED_EVENT = 'plugins:changed';
