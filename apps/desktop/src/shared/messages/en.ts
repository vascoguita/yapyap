/**
 * Widens every string literal to `string` and keeps keys and formatter
 * signatures, so a translation typed as {@link Messages} must provide every
 * key without having to repeat the English text.
 */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : { readonly [K in keyof T]: Widen<T[K]> };

/** The largest count a badge shows in full; two digits fit it. */
const MAX_BADGE = 99;

const unreadChats = (count: number): string =>
  count === 1 ? '1 unread chat' : `${String(count)} unread chats`;

const catalog = {
  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
    close: 'Close',
    whatsApp: 'WhatsApp',
  },
  about: {
    title: 'YapYap',
    details: {
      version: 'Version',
      operatingSystem: 'Operating system',
      graphics: 'Graphics',
      license: 'License',
    },
    versionValue: (version: string, channel: string): string => `${version} (${channel})`,
    unavailable: 'Details are unavailable.',
    copyDetails: 'Copy technical details',
    copied: 'Copied to the clipboard.',
    copyFailed: 'Could not copy the details.',
    linksLabel: 'Links',
    links: {
      website: 'Website',
      source: 'Source code',
      issues: 'Report a problem',
      privacy: 'Privacy',
      sponsor: 'Sponsor',
    },
    supportedBy: 'Development supported by',
    disclaimer:
      'YapYap is unofficial and is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta.',
  },
  newChat: {
    title: 'New chat',
    numberLabel: 'Phone number, with the country code',
    numberPlaceholder: '+44 7700 900123',
    numberHint: 'Start with + or 00 and the country code. YapYap does not save the number.',
    notReady: 'WhatsApp is not ready to open the chat. Try again.',
    open: 'Open Chat',
  },
  picker: {
    title: 'Choose what to share',
    screens: 'Screens',
    windows: 'Windows',
    noSources: 'No screens or windows can be shared right now.',
    nothing: 'Nothing can be shared right now.',
    audio: 'Also share system audio',
    share: 'Share',
  },
  recovery: {
    problems: {
      unsupported: {
        title: 'WhatsApp says this browser is not supported',
        advice: 'Clearing the cache usually fixes this. If it does not, check for a YapYap update.',
      },
      blank: {
        title: 'WhatsApp did not finish loading',
        advice: 'Try again. If the page stays blank, clearing the cache usually fixes it.',
      },
      'load-failed': {
        title: 'WhatsApp could not be reached',
        advice: 'Check your internet connection, then try again.',
      },
      crashed: {
        title: 'WhatsApp keeps stopping',
        advice: 'Try again. If it keeps happening, clearing the cache usually helps.',
      },
    },
    failed: 'That did not work. Please try again.',
    retry: 'Try again',
    retrying: 'Retrying…',
    clearCache: 'Clear cache and try again',
    cacheCleared: 'Cache cleared. Retrying…',
    copyDiagnostics: 'Copy diagnostics',
    diagnosticsCopied: 'Diagnostics copied to the clipboard.',
    keepsLogin: 'Clearing the cache keeps you logged in.',
  },
  settings: {
    title: 'Settings',
    unavailable: 'Settings are unavailable.',
    readOnly:
      'These settings were saved by a newer version of YapYap, so they cannot be changed here.',
    restartNeeded: 'Restart YapYap to apply your changes.',
    restartNow: 'Restart now',
    restartNote: 'Takes effect after a restart.',
    saveFailed: 'Could not save that setting.',
    sections: {
      general: 'General',
      appearance: 'Appearance',
      reliability: 'Reliability',
      privacy: 'Privacy',
      plugins: 'Plugins',
    },
    backup: {
      title: 'Backup',
      hint: 'Save your settings to a file, or bring them over from another computer. The file never includes your WhatsApp login or chats.',
      export: 'Export settings…',
      import: 'Import settings…',
      failed: 'Something went wrong. Try again.',
      fileType: 'YapYap settings',
      exported: 'Settings exported.',
      exportFailed: 'Could not save the settings file.',
      readFailed: 'Could not read that file.',
      notSettings: 'That file is not a YapYap settings file.',
      newer: 'Those settings come from a newer version of YapYap. Update YapYap to import them.',
      confirm: 'Import these settings?',
      confirmButton: 'Import',
      replaces: (invalid: number): string => {
        const replaced = 'Your current settings will be replaced.';
        if (invalid === 0) {
          return replaced;
        }
        const values = invalid === 1 ? 'value' : 'values';
        return `${replaced} ${String(invalid)} invalid ${values} in the file will use the default instead.`;
      },
      imported: 'Settings imported.',
    },
    // Shown once at startup when YapYap had to change how it loaded the settings file.
    loadNotices: {
      restored: 'Your settings file was damaged, so YapYap restored the last good copy.',
      defaults: 'Your settings file was damaged, so YapYap started with default settings.',
      newer:
        'Your settings come from a newer version of YapYap, so this version will not change them.',
      reset: 'Some settings were invalid and were reset to their defaults.',
    },
    // Why a change did not take effect, shown under its setting.
    problems: {
      autostartFailed:
        'Your system did not let YapYap start at login. Check the login or startup items in your system settings.',
      autostartUnsupported:
        'This package cannot start YapYap at login yet. Add YapYap to the startup applications in your system settings instead.',
    },
    // Keyed by setting ID; option keys are the values the settings file stores.
    fields: {
      'general.startMinimized': {
        label: 'Start minimized',
        description:
          'Open YapYap in the background, in the tray or the Dock. Starting it again shows the window.',
      },
      'general.autostart': {
        label: 'Start at login',
        description: 'Start YapYap when you log in to this computer.',
      },
      'general.betaUpdates': {
        label: 'Get beta updates',
        description:
          'Try each version a few days before its release and help find problems. Betas can be less stable; turning this off waits for the next release rather than going back.',
      },
      'general.doNotDisturb': {
        label: 'Do not disturb',
        description:
          'Show no notifications at all, and play no sounds from accounts that are not on screen. Unread counts still update.',
      },
      'general.closeToTray': {
        label: 'Close to the tray',
        description:
          'Closing the window keeps YapYap running in the tray, so notifications keep coming. Quit from the tray or the menu.',
      },
      'appearance.theme': {
        label: 'Theme',
        description:
          'Applies to YapYap and to WhatsApp, as long as WhatsApp’s own theme is set to System default.',
        options: { system: 'Same as the system', light: 'Light', dark: 'Dark' },
      },
      'appearance.autoHideMenuBar': {
        label: 'Hide the menu bar',
        description: 'Press Alt to show it when you need it.',
      },
      'appearance.trayIcon': {
        label: 'Tray icon',
        description:
          'A one-color icon matches the other icons in your panel or menu bar. Automatic picks the shade that stands out against it.',
        options: {
          color: 'App icon',
          auto: 'One color, automatic',
          light: 'One color, light',
          dark: 'One color, dark',
        },
      },
      'appearance.compactSidebar': {
        label: 'Compact account sidebar',
        description:
          'Show only the color and initial of each account in the sidebar, which appears when several accounts run.',
      },
      'reliability.hardwareAcceleration': {
        label: 'Use hardware acceleration',
        description:
          'Uses the graphics card to draw YapYap. Turn this off if the window flickers or stays blank.',
      },
      'reliability.displayBackend': {
        label: 'Display backend',
        description:
          'How YapYap talks to your display server. Try the other one if the window is blank, blurry or misplaced.',
        options: { auto: 'Automatic', wayland: 'Wayland', x11: 'X11 (XWayland)' },
      },
      'reliability.hardwareVideoDecoding': {
        label: 'Use hardware video decoding',
        description:
          'Uses the graphics card to play videos and video calls. Turn this off if video stutters or shows artifacts.',
      },
      'privacy.crashReports': {
        label: 'Crash reports',
        description:
          'After YapYap closes unexpectedly, keep a redacted report on this computer. Nothing is sent unless you choose to report it on GitHub.',
        options: {
          off: 'Off',
          local: 'Keep a local report',
          ask: 'Keep a report and offer to review it',
        },
      },
      'privacy.notificationSender': {
        label: 'Show who wrote in notifications',
        description:
          'Turn this off to show “WhatsApp” instead of the contact or group, for example when others can see your screen.',
      },
      'plugins.developerMode': {
        label: 'Developer Mode',
        description:
          'Lets you install unsigned plugins while you write them. Nobody vouches for an unsigned plugin, so YapYap marks it wherever it appears.',
      },
      'privacy.notificationText': {
        label: 'Show message text in notifications',
        description:
          'Turn this off to show “New message” instead. The text then never reaches your system’s notifications.',
      },
      'privacy.unreadWhileHidden': {
        label: 'Keep chats unread while YapYap is hidden',
        description:
          'When YapYap is hidden or minimized, WhatsApp does not mark new messages in the open chat as read. Turn this off to let the open chat keep reading.',
      },
    },
  },
  accounts: {
    defaultName: (position: number): string =>
      position === 1 ? 'WhatsApp' : `WhatsApp ${String(position)}`,
    title: 'Accounts',
    hint: 'Each account uses one of WhatsApp’s linked-device slots for its number.',
    listLabel: 'Your accounts',
    off: 'Off',
    shown: 'On screen',
    name: 'Name',
    color: 'Color',
    colors: {
      green: 'Green',
      blue: 'Blue',
      purple: 'Purple',
      orange: 'Orange',
      red: 'Red',
      teal: 'Teal',
    },
    mute: 'Mute this account',
    muteHint:
      'A muted account shows no notifications and plays no sounds while it is not on screen.',
    muted: 'Muted',
    run: 'Run this account',
    runHint:
      'An account that is off keeps its login and data on this computer, but receives no messages until you turn it on again.',
    save: 'Save',
    remove: 'Remove Account…',
    refused: 'At least one account must keep running, so this one cannot be turned off.',
    failed: 'Could not save the account. Try again.',
    unavailable: 'Accounts are unavailable.',
    discard: {
      message: 'Discard your changes to this account?',
      confirm: 'Discard',
      keep: 'Keep Editing',
    },
  },
  sidebar: {
    label: 'Accounts',
    /** An account's button: its name, then what the badge and marks show. */
    account: (name: string, unread: number, muted: boolean): string =>
      [name, muted ? 'muted' : '', !muted && unread > 0 ? unreadChats(unread) : '']
        .filter((part) => part !== '')
        .join(', '),
    badge: (unread: number): string =>
      unread > MAX_BADGE ? `${String(MAX_BADGE)}+` : String(unread),
    compact: 'Show only avatars',
    sharing: 'Sharing',
    stopSharing: (name: string): string => `Stop sharing your screen in ${name}`,
    full: 'Show account names',
    doNotDisturb: 'Do not disturb',
  },
  plugins: {
    title: 'Plugins',
    hint: 'Each plugin runs in its own sandbox and can do only what you allowed when you installed it.',
    empty: 'No plugins are installed.',
    install: 'Install Plugin…',
    fileType: 'YapYap plugins',
    version: (version: string): string => `Version ${version}`,
    trust: {
      'first-party': 'By YapYap',
      'third-party': 'Third-party',
      developer: 'Unsigned',
    },
    developerMode:
      'Developer Mode is on, so unsigned plugins can be installed. Turn it off in Settings when you no longer need it.',
    result: {
      installed: (name: string, version: string): string => `${name} ${version} is installed.`,
      rejected: 'This plugin cannot be installed.',
      failed: 'The plugin could not be installed. Try again.',
    },
    consent: {
      install: (name: string): string => `Install ${name}?`,
      update: (name: string, version: string): string => `Update ${name} to ${version}?`,
      author: (name: string): string => `By ${name}`,
      key: 'Signing key',
      unsigned: 'Not signed',
      firstParty: 'Signed by YapYap.',
      asks: 'It asks to:',
      updateAsks: 'This update asks for more than before:',
      hosts: 'Connect to:',
      nothing: 'It asks for nothing.',
      risk: 'YapYap has not reviewed this plugin. Install it only if you trust its author: you install it at your own risk.',
      unsignedRisk:
        'Nobody signed this plugin, so nothing shows who made it or that it is unchanged. Install it only if you wrote it yourself.',
      acknowledge: 'I understand that I install this plugin at my own risk',
      confirmInstall: 'Install',
      confirmUpdate: 'Update',
    },
    /** What each capability lets a plugin do, in the words the consent window uses. */
    capabilities: {
      'chat:read-active': 'Read the messages of the chat you have open',
      'chat:read-unread-summary': 'See which chats have unread messages',
      'composer:insert-draft': 'Write drafts in the message box, which you send yourself',
      'notifications:show': 'Show notifications',
      'storage:local': 'Keep its own data on this computer',
      'secrets:own': 'Keep its own secrets, such as API keys, encrypted',
    },
  },
  notifications: {
    /** With several accounts, the account a notification comes from heads it. */
    titled: (account: string, title: string): string => `${account}: ${title}`,
    hiddenSender: 'WhatsApp',
    hiddenText: 'New message',
  },
  badge: {
    unread: (count: number): string => unreadChats(count),
  },
  tray: {
    tooltip: 'YapYap',
    unread: (count: number): string => `YapYap: ${unreadChats(count)}`,
    show: 'Show YapYap',
    hide: 'Hide YapYap',
    settings: 'Settings…',
    doNotDisturb: 'Do Not Disturb',
    sharing: 'YapYap: sharing your screen',
    stopSharing: (account: string): string => `Stop Sharing Screen (${account})`,
    mutedAccount: (name: string): string => `${name} (muted)`,
    quit: 'Quit YapYap',
  },
  // `&` marks the access key on Windows and Linux; macOS ignores it.
  menu: {
    file: '&File',
    view: '&View',
    account: '&Account',
    actualSize: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    newChat: 'New Chat with Number…',
    clearCache: 'Clear Cache and Reload',
    resetSession: 'Reset Session…',
    addAccount: 'Add Account',
    manageAccounts: 'Manage Accounts…',
    plugins: 'Plugins…',
    installPlugin: 'Install Plugin…',
    removeAccount: 'Remove Account…',
    doNotDisturb: 'Do Not Disturb',
    muteAccount: 'Mute This Account',
    about: (product: string): string => `About ${product}`,
    settings: 'Settings…',
    copyDiagnostics: 'Copy Diagnostics',
  },
  windows: {
    about: (product: string): string => `About ${product}`,
    settings: (product: string): string => `${product} Settings`,
    picker: 'Share your screen',
    newChat: 'New Chat',
    accounts: 'Accounts',
    plugins: 'Plugins',
    pluginConsent: 'Install Plugin',
    offline: (pageTitle: string): string => `${pageTitle} (offline)`,
  },
  dialogs: {
    resetSession: {
      message: 'Reset this WhatsApp session?',
      detail:
        'This logs you out and deletes WhatsApp’s data on this computer. Your chats stay on your phone. To use WhatsApp here again, link this device again.',
      confirm: 'Reset Session',
    },
    removeAccount: {
      message: (name: string): string => `Remove ${name}?`,
      detail:
        'This logs the account out and deletes its WhatsApp data on this computer. Its chats stay on your phone.',
      confirm: 'Remove Account',
    },
    unsafeStart: {
      message: 'YapYap cannot start safely on this system',
      detail:
        'YapYap cannot start safely: its sandbox is turned off. On Ubuntu 24.04 and later ' +
        'this happens with the AppImage, because the system restricts unprivileged user ' +
        'namespaces. Install the .deb, .rpm or Flatpak package instead, or allow the AppImage ' +
        'with an AppArmor profile. YapYap never runs without its sandbox.',
      guide: 'Open Troubleshooting Guide',
    },
    crashReview: {
      message: 'YapYap closed unexpectedly last time',
      detail: (report: string): string =>
        `This report was saved on this computer and has not been sent anywhere. Report on GitHub opens a prefilled bug report for you to review and submit.\n\n${report}`,
      report: 'Report on GitHub…',
      copy: 'Copy Report',
    },
    installUpdate: {
      message: (version: string): string => `YapYap ${version} is ready to install`,
      detail:
        'It was downloaded and verified. Restart YapYap to install it now, or keep working and install it later.',
      install: 'Restart and Install',
      later: 'Later',
    },
    media: {
      devices: { audio: 'microphone', video: 'camera' },
      request: (account: string, devices: readonly string[]): string =>
        `${account} wants to use your ${devices.join(' and ')}.`,
      detail: 'YapYap remembers your answer until you quit.',
      allow: 'Allow',
      deny: 'Deny',
    },
  },
  notices: {
    safeMode: 'YapYap started in safe mode, without hardware acceleration.',
    gpuCrashes:
      'Graphics kept crashing, so YapYap started without hardware acceleration this time.',
    whatsAppReloaded: 'WhatsApp stopped unexpectedly and was reloaded.',
    newRelease: (version: string): string =>
      `YapYap ${version} is available. Click to open its download page.`,
    downloaded: (name: string): string => `Downloaded ${name} to your Downloads folder.`,
    downloadFailed: (name: string): string => `Could not download ${name}.`,
  },
} as const;

/** The shape every message catalog has; a missing key is a compile error. */
export type Messages = Widen<typeof catalog>;

/** The English text of YapYap's own windows, menus, dialogs and notifications. */
export const en: Messages = catalog;
