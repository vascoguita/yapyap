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
    id: 'reliability.hardwareAcceleration',
    label: 'Use hardware acceleration',
    description:
      'Uses the graphics card to draw YapYap. Turn this off if the window flickers or stays blank.',
    restart: true,
  },
  {
    id: 'reliability.hardwareVideoDecoding',
    label: 'Use hardware video decoding',
    description:
      'Uses the graphics card to play videos and video calls. Turn this off if video stutters or shows artifacts.',
    restart: true,
  },
];
