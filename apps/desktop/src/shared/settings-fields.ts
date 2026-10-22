/** A value the settings window can show and change. */
export type SettingValue = boolean | string;

/** A settings file section, in the order the settings window lists them. */
export const SETTINGS_SECTIONS = [
  { id: 'general', title: 'General' },
  { id: 'appearance', title: 'Appearance' },
  { id: 'reliability', title: 'Reliability' },
  { id: 'privacy', title: 'Privacy' },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

export interface SettingField {
  /** `section.key` in the settings file. */
  readonly id: `${SettingsSection}.${string}`;
  readonly label: string;
  readonly description: string;
  /** Takes effect only at the next launch, so changing it offers a restart. */
  readonly restart: boolean;
  /** One of several values; without options, the setting is an on/off switch. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /** The platforms (`process.platform`) where it does something; all of them when absent. */
  readonly platforms?: readonly string[];
}

/**
 * What the settings window shows. A setting appears here only once YapYap
 * acts on it, so the window never offers a switch that does nothing.
 */
export const SETTING_FIELDS: readonly SettingField[] = [
  {
    id: 'appearance.theme',
    label: 'Theme',
    description:
      'Applies to YapYap and to WhatsApp, as long as WhatsApp’s own theme is set to System default.',
    restart: false,
    options: [
      { value: 'system', label: 'Same as the system' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },
  {
    id: 'appearance.autoHideMenuBar',
    label: 'Hide the menu bar',
    description: 'Press Alt to show it when you need it.',
    restart: false,
    platforms: ['linux', 'win32'],
  },
  {
    id: 'reliability.hardwareAcceleration',
    label: 'Use hardware acceleration',
    description:
      'Uses the graphics card to draw YapYap. Turn this off if the window flickers or stays blank.',
    restart: true,
  },
  {
    id: 'reliability.displayBackend',
    label: 'Display backend',
    description:
      'How YapYap talks to your display server. Try the other one if the window is blank, blurry or misplaced.',
    restart: true,
    options: [
      { value: 'auto', label: 'Automatic' },
      { value: 'wayland', label: 'Wayland' },
      { value: 'x11', label: 'X11 (XWayland)' },
    ],
    platforms: ['linux'],
  },
  {
    id: 'reliability.hardwareVideoDecoding',
    label: 'Use hardware video decoding',
    description:
      'Uses the graphics card to play videos and video calls. Turn this off if video stutters or shows artifacts.',
    restart: true,
  },
  {
    id: 'privacy.crashReports',
    label: 'Crash reports',
    description:
      'After YapYap closes unexpectedly, keep a redacted report on this computer. Nothing is sent unless you choose to report it on GitHub.',
    restart: false,
    options: [
      { value: 'off', label: 'Off' },
      { value: 'local', label: 'Keep a local report' },
      { value: 'ask', label: 'Keep a report and offer to review it' },
    ],
  },
  {
    id: 'privacy.unreadWhileHidden',
    label: 'Keep chats unread while YapYap is hidden',
    description:
      'When YapYap is hidden or minimized, WhatsApp does not mark new messages in the open chat as read. Turn this off to let the open chat keep reading.',
    restart: false,
  },
];
