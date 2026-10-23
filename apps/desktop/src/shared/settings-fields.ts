import { en } from './messages/en.ts';

/** A value the settings window can show and change. */
export type SettingValue = boolean | string | number;

/** A settings file section, in the order the settings window lists them. */
export const SETTINGS_SECTIONS = [
  { id: 'general', title: en.settings.sections.general },
  { id: 'appearance', title: en.settings.sections.appearance },
  { id: 'reliability', title: en.settings.sections.reliability },
  { id: 'privacy', title: en.settings.sections.privacy },
  { id: 'plugins', title: en.settings.sections.plugins },
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
  readonly options?: readonly { readonly value: string | number; readonly label: string }[];
  /** The platforms (`process.platform`) where it does something; all of them when absent. */
  readonly platforms?: readonly string[];
}

const text = en.settings.fields;

/** Only IDs with catalog text compile, so a field can never lack its label. */
function described(id: keyof typeof text): Pick<SettingField, 'id' | 'label' | 'description'> {
  return { id, label: text[id].label, description: text[id].description };
}

/** Catalog option keys are the stored values, listed in catalog order. */
function choices(options: Readonly<Record<string, string>>): NonNullable<SettingField['options']> {
  return Object.entries(options).map(([value, label]) => ({ value, label }));
}

/** WhatsApp's zoom in Settings: common steps; the View menu goes finer and up to 300%. */
const INTERFACE_SCALES = [
  { factor: 0.5 },
  { factor: 0.75 },
  { factor: 0.9 },
  { factor: 1 },
  { factor: 1.1 },
  { factor: 1.25 },
  { factor: 1.5 },
  { factor: 1.75 },
  { factor: 2 },
].map(({ factor }) => factor);

/**
 * What the settings window shows. A setting appears here only once YapYap
 * acts on it, so the window never offers a switch that does nothing.
 */
export const SETTING_FIELDS: readonly SettingField[] = [
  { ...described('general.autostart'), restart: false },
  { ...described('general.startMinimized'), restart: false },
  { ...described('general.betaUpdates'), restart: false },
  { ...described('general.doNotDisturb'), restart: false },
  // macOS always keeps YapYap in the Dock when the window closes.
  { ...described('general.closeToTray'), restart: false, platforms: ['linux', 'win32'] },
  {
    ...described('appearance.theme'),
    restart: false,
    options: choices(text['appearance.theme'].options),
  },
  { ...described('appearance.autoHideMenuBar'), restart: false, platforms: ['linux', 'win32'] },
  {
    ...described('appearance.zoom'),
    restart: false,
    options: INTERFACE_SCALES.map((value) => ({ value, label: en.settings.scale(value) })),
  },
  { ...described('appearance.pinchZoom'), restart: false },
  { ...described('appearance.compactSidebar'), restart: false },
  {
    ...described('appearance.trayIcon'),
    restart: false,
    options: choices(text['appearance.trayIcon'].options),
  },
  { ...described('reliability.hardwareAcceleration'), restart: true },
  {
    ...described('reliability.displayBackend'),
    restart: true,
    options: choices(text['reliability.displayBackend'].options),
    platforms: ['linux'],
  },
  { ...described('reliability.hardwareVideoDecoding'), restart: true },
  {
    ...described('reliability.diskCacheMb'),
    restart: true,
    options: choices(text['reliability.diskCacheMb'].options),
  },
  {
    ...described('reliability.jsHeapMb'),
    restart: true,
    options: choices(text['reliability.jsHeapMb'].options),
  },
  {
    ...described('privacy.crashReports'),
    restart: false,
    options: choices(text['privacy.crashReports'].options),
  },
  { ...described('privacy.unreadWhileHidden'), restart: false },
  { ...described('privacy.notificationSender'), restart: false },
  { ...described('privacy.notificationText'), restart: false },
  { ...described('privacy.blurWhenUnfocused'), restart: false },
  { ...described('privacy.blurWhenIdle'), restart: false },
  { ...described('plugins.developerMode'), restart: false },
];
