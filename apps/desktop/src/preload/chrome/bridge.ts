import {
  CHROME_CHANNELS,
  type AboutInfo,
  type AccountList,
  type ChromeApi,
  type PickerOffer,
  type PluginConsent,
  type PluginList,
  type RecoveryProblem,
  type SettingsSnapshot,
  type SidebarState,
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
    picker: {
      offer: () => invoke(CHROME_CHANNELS.pickerOffer) as Promise<PickerOffer>,
      choose: async (id, audio) => {
        await invoke(CHROME_CHANNELS.pickerChoose, id, audio);
      },
      cancel: run(CHROME_CHANNELS.pickerCancel),
    },
  };
}
