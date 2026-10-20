/** A value the settings window can show and change. */
export type SettingValue = boolean;

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
}

/**
 * What the settings window shows. A setting appears here only once YapYap
 * acts on it, so the window never offers a switch that does nothing.
 */
export const SETTING_FIELDS: readonly SettingField[] = [
  {
    id: 'reliability.hardwareAcceleration',
    label: 'Use hardware acceleration',
    description:
      'Uses the graphics card to draw YapYap. Turn this off if the window flickers or stays blank.',
    restart: true,
  },
];
