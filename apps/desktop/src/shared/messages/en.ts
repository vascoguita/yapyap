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

const catalog = {
  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
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
    },
    backup: {
      title: 'Backup',
      hint: 'Save your settings to a file, or bring them over from another computer. The file never includes your WhatsApp login or chats.',
      export: 'Export settings…',
      import: 'Import settings…',
      failed: 'Something went wrong. Try again.',
    },
    // Keyed by setting ID; option keys are the values the settings file stores.
    fields: {
      'general.startMinimized': {
        label: 'Start minimized',
        description:
          'Open YapYap in the background, in the tray or the Dock. Starting it again shows the window.',
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
      'privacy.unreadWhileHidden': {
        label: 'Keep chats unread while YapYap is hidden',
        description:
          'When YapYap is hidden or minimized, WhatsApp does not mark new messages in the open chat as read. Turn this off to let the open chat keep reading.',
      },
    },
  },
  tray: {
    tooltip: 'YapYap',
    show: 'Show YapYap',
    quit: 'Quit YapYap',
  },
} as const;

/** The shape every message catalog has; a missing key is a compile error. */
export type Messages = Widen<typeof catalog>;

/** The English text of YapYap's own windows. */
export const en: Messages = catalog;
