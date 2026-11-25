import { en } from './messages/en.ts';

/** A value the settings window can show and change. */
export type SettingValue = boolean | string | number;

/** The settings file's sections; the window groups their fields into its own pages. */
export const SETTINGS_SECTIONS = [
  'assistant',
  'agents',
  'general',
  'spelling',
  'appearance',
  'reliability',
  'downloads',
  'privacy',
  'network',
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface SettingField {
  /** `section.key` in the settings file. */
  readonly id: `${SettingsSection}.${string}`;
  readonly label: string;
  /** The label on macOS, where the tray is the menu bar. */
  readonly labelMac?: string;
  readonly description: string;
  /** The description on macOS, where it words the place differently, such as the menu bar for the tray. */
  readonly descriptionMac?: string;
  /** Takes effect only at the next launch, so changing it offers a restart. */
  readonly restart: boolean;
  /** One of several values; without options, the setting is an on/off switch. */
  readonly options?: readonly { readonly value: string | number; readonly label: string }[];
  /** Few, short options, shown side by side beside the label; others are a list to pick from. */
  readonly segmented?: boolean;
  /** Names a stored value that is not among the options, such as a zoom the View menu set. */
  readonly unlisted?: (value: SettingValue) => string;
  /**
   * A whole number, stepped through `steps` with − and + buttons (#766).
   * With `words` around it, it sits under the setting before it, in a line
   * of its own.
   */
  readonly stepper?: {
    readonly steps: readonly number[];
    readonly words?: { readonly before: string; readonly after: string };
  };
  /** A line of text, such as an address, instead of a switch or a choice. */
  readonly text?: { readonly placeholder: string };
  /** A folder, picked in the system's folder dialog; empty is the default folder, named here. */
  readonly folder?: { readonly defaultName: string; readonly useDefault: string };
  /** The platforms (`process.platform`) where it does something; all of them when absent. */
  readonly platforms?: readonly string[];
}

const text = en.settings.fields;

type Texts = typeof text;

/**
 * Only settings with catalog text compile, so a field can never lack its
 * label. The catalog nests them by section, since translation tools read a
 * `.` in a key as nesting (#374).
 */
function described<S extends keyof Texts>(
  section: S,
  key: keyof Texts[S] & string,
): Pick<SettingField, 'id' | 'label' | 'labelMac' | 'description' | 'descriptionMac'> {
  const { label, labelMac, description, descriptionMac } = text[section][key] as {
    label: string;
    labelMac?: string;
    description: string;
    descriptionMac?: string;
  };
  return {
    id: `${section}.${key}`,
    label,
    description,
    ...(labelMac === undefined ? {} : { labelMac }),
    ...(descriptionMac === undefined ? {} : { descriptionMac }),
  };
}

/** The label a field has on `platform`. */
export const labelOn = (field: SettingField, platform: string): string =>
  platform === 'darwin' ? (field.labelMac ?? field.label) : field.label;

/** The description a field has on `platform`. */
export const descriptionOn = (field: SettingField, platform: string): string =>
  platform === 'darwin' ? (field.descriptionMac ?? field.description) : field.description;

/** Catalog option keys are the stored values, listed in catalog order. */
function choices(options: Readonly<Record<string, string>>): NonNullable<SettingField['options']> {
  return Object.entries(options).map(([value, label]) => ({ value, label }));
}

/** Whole numbers from `from` to `to`, `by` apart. */
const range = (from: number, to: number, by: number): number[] =>
  Array.from({ length: Math.floor((to - from) / by) + 1 }, (_, index) => from + index * by);

/** Unread messages that start a summary: one by one while few, then by five (#766). */
const UNREAD_STEPS = [...range(2, 5, 1), ...range(10, 200, 5)];

/** Messages the assistant reads, ten by ten, as the schema allows (#766). */
const MESSAGE_STEPS = range(10, 200, 10);

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

const scaleLabel = (value: SettingValue): string =>
  en.settings.scale({ percent: Math.round(Number(value) * 100) });

/**
 * What the settings window shows. A setting appears here only once YapYap
 * acts on it, so the window never offers a switch that does nothing.
 */
export const SETTING_FIELDS: readonly SettingField[] = [
  { ...described('assistant', 'enabled'), restart: false },
  {
    ...described('assistant', 'provider'),
    restart: false,
    options: choices(text.assistant.provider.options),
  },
  {
    ...described('assistant', 'model'),
    restart: false,
    text: { placeholder: en.assistant.settings.model.auto },
  },
  { ...described('assistant', 'autoSuggest'), restart: false },
  { ...described('assistant', 'summaries'), restart: false },
  {
    ...described('assistant', 'summarizeFrom'),
    restart: false,
    stepper: {
      steps: UNREAD_STEPS,
      words: {
        before: text.assistant.summarizeFrom.before,
        after: text.assistant.summarizeFrom.after,
      },
    },
  },
  {
    ...described('assistant', 'chats'),
    restart: false,
    segmented: true,
    options: choices(text.assistant.chats.options),
  },
  { ...described('assistant', 'messages'), restart: false, stepper: { steps: MESSAGE_STEPS } },
  {
    ...described('assistant', 'server'),
    restart: false,
    text: { placeholder: en.assistant.settings.server.addressPlaceholder },
  },
  { ...described('agents', 'enabled'), restart: false },
  { ...described('general', 'autostart'), restart: false },
  { ...described('general', 'startMinimized'), restart: false },
  { ...described('general', 'betaUpdates'), restart: false },
  { ...described('general', 'doNotDisturb'), restart: false },
  // On macOS it closes to the menu bar alone; without it, the Dock keeps YapYap (#708).
  { ...described('general', 'closeToTray'), restart: false },
  { ...described('spelling', 'enabled'), restart: false },
  {
    ...described('appearance', 'theme'),
    restart: false,
    segmented: true,
    options: choices(text.appearance.theme.options),
  },
  { ...described('appearance', 'autoHideMenuBar'), restart: false, platforms: ['linux', 'win32'] },
  {
    ...described('appearance', 'zoom'),
    restart: false,
    options: INTERFACE_SCALES.map((value) => ({
      value,
      label: scaleLabel(value),
    })),
    unlisted: scaleLabel,
  },
  { ...described('appearance', 'compactSidebar'), restart: false },
  {
    ...described('appearance', 'trayIcon'),
    restart: false,
    options: choices(text.appearance.trayIcon.options),
  },
  { ...described('reliability', 'hardwareAcceleration'), restart: true },
  {
    ...described('reliability', 'displayBackend'),
    restart: true,
    segmented: true,
    options: choices(text.reliability.displayBackend.options),
    platforms: ['linux'],
  },
  { ...described('reliability', 'hardwareVideoDecoding'), restart: true },
  {
    ...described('reliability', 'diskCacheMb'),
    restart: true,
    options: choices(text.reliability.diskCacheMb.options),
  },
  {
    ...described('reliability', 'jsHeapMb'),
    restart: true,
    options: choices(text.reliability.jsHeapMb.options),
  },
  {
    ...described('privacy', 'crashReports'),
    restart: false,
    options: choices(text.privacy.crashReports.options),
  },
  { ...described('privacy', 'unreadWhileHidden'), restart: false },
  { ...described('privacy', 'notificationSender'), restart: false },
  { ...described('privacy', 'notificationText'), restart: false },
  { ...described('privacy', 'blurWhenUnfocused'), restart: false },
  { ...described('privacy', 'blurWhenIdle'), restart: false },
  { ...described('downloads', 'askWhere'), restart: false },
  {
    ...described('downloads', 'folder'),
    restart: false,
    folder: { defaultName: en.settings.defaultFolder, useDefault: en.settings.useDefaultFolder },
  },
  { ...described('downloads', 'openWhenDone'), restart: false },
  {
    ...described('network', 'proxyMode'),
    restart: false,
    segmented: true,
    options: choices(text.network.proxyMode.options),
  },
  {
    ...described('network', 'proxyServer'),
    restart: false,
    text: { placeholder: en.settings.proxyPlaceholder },
  },
];
