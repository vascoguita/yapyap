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

/** What the assistant bar beneath the open chat shows (ADR 0013). */
export interface AssistantBarState {
  /** The name of the extension whose suggestions these are. */
  readonly extension: string;
  /** A short line from YapYap or the extension, such as "Thinking…"; empty for none. */
  readonly status: string;
  /** Plain text, never markup. */
  readonly suggestions: readonly string[];
  /** The label of a button that answers the extension's question, if it asked one. */
  readonly confirm: string | undefined;
  /** Waiting for the extension. */
  readonly working: boolean;
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
 * Who vouches for an extension: YapYap's own key, another author's key the user
 * pins on first install, that key reviewed by YapYap for the marketplace
 * (ADR 0014), or nobody (Developer Mode only).
 */
export type ExtensionTrust = 'first-party' | 'reviewed' | 'third-party' | 'developer';

/** Grants an extension asks for: capabilities, and network hosts one by one. */
interface ExtensionGrants {
  readonly capabilities: readonly string[];
  readonly hosts: readonly string[];
}

/** What the consent window shows before an extension is installed or updated (ADR 0004). */
export interface ExtensionConsent extends ExtensionGrants {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: { readonly name: string; readonly url: string | null };
  /** The signing key's fingerprint; null for an unsigned extension. */
  readonly fingerprint: string | null;
  readonly trust: ExtensionTrust;
  /** An update to an installed extension, which asks only because it wants more. */
  readonly update: boolean;
  /** On an update, what it asks for that was not granted before. */
  readonly added: ExtensionGrants;
}

/** An extension the marketplace lists, as the Extensions window shows it (ADR 0014). */
export interface MarketplaceEntry {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly author: { readonly name: string; readonly url: string | null };
  readonly homepage: string;
  /** YapYap's own extension, or a third-party extension the maintainer reviewed. */
  readonly review: 'official' | 'reviewed';
  /** The newest version this YapYap runs, or the newest listed when none does. */
  readonly version: string;
  readonly capabilities: readonly string[];
  readonly hosts: readonly string[];
  /** What changed in `version`, as the marketplace lists it; null when it says nothing. */
  readonly notes: string | null;
  /** The installed version, if the extension is installed. */
  readonly installed: string | null;
  readonly action: 'install' | 'update' | 'installed' | 'incompatible';
}

/** The marketplace, or why it cannot be shown. */
export interface MarketplaceView {
  readonly status: 'ready' | 'unreachable' | 'invalid' | 'outdated';
  readonly extensions: readonly MarketplaceEntry[];
}

/** What YapYap's call-recording window shows by the call (ADR 0015). */
export interface RecordPromptState {
  /** The extension that asked to record. */
  readonly extension: string;
  /** Asking whether to record, recording, or finished. */
  readonly phase: 'asking' | 'recording' | 'ended';
  /** When the recording started, as an ISO date; null until it does. */
  readonly since: string | null;
}

/** What the main process tells the hidden recorder page to do. */
export type RecorderCommand = 'start' | 'stop';

/** An installed extension, as the Extensions window lists it. */
export interface InstalledExtension {
  readonly id: string;
  readonly version: string;
  readonly trust: ExtensionTrust;
  /** Why the marketplace pulled this version, which YapYap then does not run (ADR 0014). */
  readonly pulled: string | null;
  /** What the user approved, and whether each grant still stands (#94). */
  readonly grants: readonly ExtensionGrant[];
  /** The extension's settings form, with what the user saved; empty when it has none (#98). */
  readonly settings: readonly ExtensionSetting[];
}

/** One field of an extension's settings form, as YapYap renders it. */
export interface ExtensionSetting {
  readonly key: string;
  readonly type: 'string' | 'number' | 'integer' | 'boolean';
  readonly title?: string;
  readonly description?: string;
  /** The values to choose from, when the extension lists them. */
  readonly enum?: readonly (string | number)[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  /** Missing until the user saves one. */
  readonly value?: string | number | boolean;
}

/**
 * One capability or `network:<host>` the user approved: granted for the
 * whole extension, or, for one that acts on an account, account by account.
 */
export interface ExtensionGrant {
  readonly capability: string;
  readonly granted: boolean;
  /** Set for a capability that acts on the account on screen. */
  readonly accounts?: readonly {
    readonly id: string;
    readonly name: string;
    readonly granted: boolean;
  }[];
}

export interface ExtensionList {
  readonly extensions: readonly InstalledExtension[];
  readonly developerMode: boolean;
  /** What extensions asked YapYap to do, newest first; never what they sent or got. */
  readonly activity: readonly ExtensionActivity[];
}

/** One call an extension made, by operation and outcome. */
export interface ExtensionActivity {
  readonly time: string;
  readonly extension: string;
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
  readonly assistantBar: {
    readonly state: () => Promise<AssistantBarState>;
    readonly suggest: () => Promise<void>;
    readonly prompt: (text: string) => Promise<void>;
    readonly confirm: () => Promise<void>;
    /** Puts the suggestion in the message box. */
    readonly use: (index: number) => Promise<void>;
    /** Puts the suggestion in the message box and sends it, on this click only. */
    readonly send: (index: number) => Promise<void>;
    readonly onState: (listener: (state: AssistantBarState) => void) => void;
  };
  readonly quickPanel: {
    /** Switches to the account and brings YapYap's window back. */
    readonly open: (id: string) => Promise<void>;
    readonly setDoNotDisturb: (on: boolean) => Promise<void>;
  };
  /** YapYap's own window by a call, which asks to record it and shows the recording (ADR 0015). */
  readonly recordPrompt: {
    readonly state: () => Promise<RecordPromptState>;
    /** The user's answer: record this call, or not. */
    readonly answer: (record: boolean) => Promise<void>;
    readonly stop: () => Promise<void>;
    readonly onState: (listener: (state: RecordPromptState) => void) => void;
  };
  /** The hidden page that captures and encodes a call's sound (ADR 0015). */
  readonly recorder: {
    readonly onCommand: (listener: (command: RecorderCommand) => void) => void;
    /** Hands over encoded sound, in order. */
    readonly chunk: (bytes: Uint8Array) => Promise<void>;
    /** Everything was handed over after a stop. */
    readonly ended: () => Promise<void>;
    /** Capturing failed, so the recording is thrown away. */
    readonly failed: () => Promise<void>;
  };
  readonly extensions: {
    readonly list: () => Promise<ExtensionList>;
    /** Downloads and verifies the marketplace's list; only the Marketplace tab asks (ADR 0014). */
    readonly marketplace: () => Promise<MarketplaceView>;
    /** Installs the version of a listed extension the marketplace offers, after the usual consent. */
    readonly installListed: (id: string) => Promise<void>;
    /** The pending install this consent window asks about. */
    readonly consent: () => Promise<ExtensionConsent>;
    /** `acknowledged`: the user accepted the risk of an extension YapYap has not reviewed. */
    readonly answer: (install: boolean, acknowledged: boolean) => Promise<void>;
    /** Saves one setting of an extension; null goes back to the extension's own default. */
    readonly setSetting: (
      id: string,
      key: string,
      value: string | number | boolean | null,
    ) => Promise<ExtensionList>;
    /** Grants a capability again or takes it back: for one account, or the whole extension with null. */
    readonly setGrant: (
      id: string,
      capability: string,
      account: string | null,
      granted: boolean,
    ) => Promise<ExtensionList>;
    /** Removes an extension and everything it kept, once the user confirms (#332). */
    readonly remove: (id: string) => Promise<ExtensionList>;
    /** Calls `listener` whenever an extension is installed, updated, removed or stopped (#342). */
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
  /** The running extensions' commands (#443). */
  readonly extensions: readonly ExtensionShortcutState[];
}

/** An extension command's keys: those it has now, those it suggests, and whether the user chose. */
export interface ExtensionShortcutState {
  /** `extension/command`. */
  readonly id: string;
  readonly label: string;
  /** Empty when it has no keys, because the user removed them or something else has them. */
  readonly accelerator: string;
  /** Empty when the extension suggests none. */
  readonly suggested: string;
  readonly custom: boolean;
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
  assistantBarState: 'assistant-bar:state',
  assistantBarSuggest: 'assistant-bar:suggest',
  assistantBarPrompt: 'assistant-bar:prompt',
  assistantBarConfirm: 'assistant-bar:confirm',
  assistantBarUse: 'assistant-bar:use',
  assistantBarSend: 'assistant-bar:send',
  reportDiagnostics: 'report:diagnostics',
  reportOpen: 'report:open',
  recordPromptState: 'record-prompt:state',
  recordPromptAnswer: 'record-prompt:answer',
  recordPromptStop: 'record-prompt:stop',
  recorderChunk: 'recorder:chunk',
  recorderEnded: 'recorder:ended',
  recorderFailed: 'recorder:failed',
  extensionsList: 'extensions:list',
  extensionsConsent: 'extensions:consent',
  extensionsAnswer: 'extensions:answer',
  extensionsSetGrant: 'extensions:set-grant',
  extensionsSetSetting: 'extensions:set-setting',
  extensionsRemove: 'extensions:remove',
  extensionsMarketplace: 'extensions:marketplace',
  extensionsInstallListed: 'extensions:install-listed',
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

/** YapYap sends the assistant bar its new state on this channel (ADR 0013). */
export const ASSISTANT_BAR_STATE_EVENT = 'assistant-bar:state-changed';

/** Tells an open Extensions window that the installed extensions changed (#342). */
export const EXTENSIONS_CHANGED_EVENT = 'extensions:changed';

/** Tells the call-recording window how the recording stands. */
export const RECORD_PROMPT_STATE_EVENT = 'record-prompt:state-changed';

/** Tells the recorder page to start or stop capturing. */
export const RECORDER_COMMAND_EVENT = 'recorder:command';
