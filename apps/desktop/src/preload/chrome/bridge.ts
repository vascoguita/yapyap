import {
  CHROME_CHANNELS,
  type AboutInfo,
  type AccountList,
  type ChromeApi,
  type PickerOffer,
  type PluginConsent,
  type PluginList,
  type ShortcutList,
  type RecoveryProblem,
  type SettingsSnapshot,
  type SidebarState,
  type SpellingLanguages,
  type TransferResult,
} from '../../shared/chrome-api.ts';

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
/** Hears the sidebar's state, the only thing the main process sends. */
type Listen = (listener: (state: SidebarState) => void) => void;

function accountsBridge(invoke: Invoke): ChromeApi['accounts'] {
  return {
    list: () => invoke(CHROME_CHANNELS.accountsList) as Promise<AccountList>,
    save: (id, change) =>
      invoke(CHROME_CHANNELS.accountsSave, id, change) as Promise<AccountList | null>,
    remove: (id) => invoke(CHROME_CHANNELS.accountsRemove, id) as Promise<AccountList>,
    permissions: (id) =>
      invoke(CHROME_CHANNELS.accountsPermissions, id) as Promise<readonly string[] | null>,
    forgetPermissions: (id) =>
      invoke(CHROME_CHANNELS.accountsForgetPermissions, id) as Promise<readonly string[] | null>,
  };
}

function sidebarBridge(invoke: Invoke, listen: Listen): ChromeApi['sidebar'] {
  return {
    state: () => invoke(CHROME_CHANNELS.sidebarState) as Promise<SidebarState>,
    switchTo: async (id) => {
      await invoke(CHROME_CHANNELS.sidebarSwitch, id);
    },
    setCompact: async (compact) => {
      await invoke(CHROME_CHANNELS.sidebarSetCompact, compact);
    },
    stopSharing: async (id) => {
      await invoke(CHROME_CHANNELS.sidebarStopSharing, id);
    },
    onState: listen,
  };
}

function pluginsBridge(invoke: Invoke): ChromeApi['plugins'] {
  return {
    list: () => invoke(CHROME_CHANNELS.pluginsList) as Promise<PluginList>,
    consent: () => invoke(CHROME_CHANNELS.pluginsConsent) as Promise<PluginConsent>,
    answer: async (install, acknowledged) => {
      await invoke(CHROME_CHANNELS.pluginsAnswer, install, acknowledged);
    },
  };
}

function pickerBridge(invoke: Invoke): ChromeApi['picker'] {
  return {
    offer: () => invoke(CHROME_CHANNELS.pickerOffer) as Promise<PickerOffer>,
    choose: async (id, audio) => {
      await invoke(CHROME_CHANNELS.pickerChoose, id, audio);
    },
    cancel: async () => {
      await invoke(CHROME_CHANNELS.pickerCancel);
    },
  };
}

function shortcutsBridge(invoke: Invoke): ChromeApi['shortcuts'] {
  return { list: () => invoke(CHROME_CHANNELS.shortcutsList) as Promise<ShortcutList> };
}

function reportBridge(invoke: Invoke): ChromeApi['report'] {
  return {
    diagnostics: () => invoke(CHROME_CHANNELS.reportDiagnostics) as Promise<string>,
    open: async (description) => {
      await invoke(CHROME_CHANNELS.reportOpen, description);
    },
  };
}

function spellingBridge(invoke: Invoke): ChromeApi['spelling'] {
  return {
    languages: () => invoke(CHROME_CHANNELS.spellingLanguages) as Promise<SpellingLanguages>,
    // A copy, so the page cannot change the list while it is on its way.
    choose: (languages) =>
      invoke(CHROME_CHANNELS.spellingChoose, [...languages]) as Promise<SpellingLanguages>,
  };
}

/**
 * Builds the chrome API from a single invoke function. Each operation has its
 * own fixed channel, so the page can never choose what it calls.
 */
export function createChromeBridge(invoke: Invoke, listen: Listen): ChromeApi {
  const run = (channel: string) => async (): Promise<void> => {
    await invoke(channel);
  };
  return {
    about: {
      info: () => invoke(CHROME_CHANNELS.aboutInfo) as Promise<AboutInfo>,
      copyTechnicalDetails: run(CHROME_CHANNELS.copyTechnicalDetails),
    },
    recovery: {
      problem: () => invoke(CHROME_CHANNELS.recoveryProblem) as Promise<RecoveryProblem | null>,
      retry: run(CHROME_CHANNELS.recoveryRetry),
      clearCache: run(CHROME_CHANNELS.recoveryClearCache),
      copyDiagnostics: run(CHROME_CHANNELS.recoveryCopyDiagnostics),
    },
    settings: {
      get: () => invoke(CHROME_CHANNELS.settingsGet) as Promise<SettingsSnapshot>,
      set: (id, value) =>
        invoke(CHROME_CHANNELS.settingsSet, id, value) as Promise<SettingsSnapshot>,
      restart: run(CHROME_CHANNELS.settingsRestart),
      export: () => invoke(CHROME_CHANNELS.settingsExport) as Promise<TransferResult>,
      import: () => invoke(CHROME_CHANNELS.settingsImport) as Promise<TransferResult>,
    },
    chat: {
      openNumber: (number) => invoke(CHROME_CHANNELS.chatOpenNumber, number) as Promise<boolean>,
    },
    accounts: accountsBridge(invoke),
    sidebar: sidebarBridge(invoke, listen),
    plugins: pluginsBridge(invoke),
    report: reportBridge(invoke),
    spelling: spellingBridge(invoke),
    picker: pickerBridge(invoke),
    shortcuts: shortcutsBridge(invoke),
  };
}
