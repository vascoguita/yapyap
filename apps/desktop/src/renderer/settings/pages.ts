import type { SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import type { IconName } from './icons.tsx';

const text = en.settings;
const groups = text.groups;

/** Settings that belong together in one card, by field id. */
export interface SettingsGroup {
  readonly id: string;
  readonly title: string;
  readonly ids: readonly string[];
}

/**
 * One page of the window. Pages group settings as people look for them,
 * not as the settings file stores them, so a page may hold settings from
 * several sections of the file.
 */
export interface SettingsPage {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly intro?: string;
  /** A page with more than settings has a component of its own instead of groups. */
  readonly own?: 'assistant' | 'agents' | 'backup';
  readonly groups: readonly SettingsGroup[];
  /** Comes after a divider, as a page for when something goes wrong. */
  readonly apart?: boolean;
}

const group = (id: string, title: string, ids: readonly string[]): SettingsGroup => ({
  id,
  title,
  ids,
});

/** Most used first; what people change only to fix a problem comes last. */
const PAGES: readonly SettingsPage[] = [
  {
    id: 'general',
    title: text.pages.general,
    icon: 'general',
    groups: [
      group('startup', groups.startup, [
        'general.autostart',
        'general.startMinimized',
        'general.closeToTray',
      ]),
      group('writing', groups.writing, ['spelling.enabled']),
      group('updates', groups.updates, ['general.betaUpdates']),
    ],
  },
  {
    id: 'appearance',
    title: text.pages.appearance,
    icon: 'appearance',
    groups: [
      group('look', groups.look, ['appearance.theme', 'appearance.zoom', 'appearance.pinchZoom']),
      group('window', groups.window, [
        'appearance.autoHideMenuBar',
        'appearance.compactSidebar',
        'appearance.trayIcon',
      ]),
    ],
  },
  {
    id: 'notifications',
    title: text.pages.notifications,
    icon: 'notifications',
    groups: [
      group('notifications', groups.notifications, [
        'general.doNotDisturb',
        'privacy.notificationSender',
        'privacy.notificationText',
      ]),
      group('screen-privacy', groups.screenPrivacy, [
        'privacy.unreadWhileHidden',
        'privacy.blurWhenUnfocused',
        'privacy.blurWhenIdle',
      ]),
      group('crash-reports', groups.crashReports, ['privacy.crashReports']),
    ],
  },
  {
    id: 'downloads',
    title: text.pages.downloads,
    icon: 'downloads',
    groups: [
      group('saving', groups.savingFiles, ['downloads.askWhere', 'downloads.folder']),
      group('after', groups.afterDownloading, ['downloads.openWhenDone']),
    ],
  },
  {
    id: 'assistant',
    title: text.pages.assistant,
    icon: 'assistant',
    intro: en.assistant.settings.intro,
    own: 'assistant',
    groups: [],
  },
  {
    id: 'agents',
    title: text.pages.agents,
    icon: 'agents',
    intro: en.agents.intro,
    own: 'agents',
    groups: [],
  },
  {
    id: 'network',
    title: text.pages.network,
    icon: 'network',
    groups: [group('proxy', groups.proxy, ['network.proxyMode', 'network.proxyServer'])],
  },
  {
    id: 'advanced',
    title: text.pages.advanced,
    icon: 'advanced',
    intro: text.advancedIntro,
    apart: true,
    groups: [
      group('rendering', groups.rendering, [
        'reliability.hardwareAcceleration',
        'reliability.displayBackend',
        'reliability.hardwareVideoDecoding',
      ]),
      group('memory', groups.memory, ['reliability.diskCacheMb', 'reliability.jsHeapMb']),
    ],
  },
];

/** Every platform has Backup, last. */
export const BACKUP_PAGE: SettingsPage = {
  id: 'backup',
  title: text.pages.backup,
  icon: 'backup',
  own: 'backup',
  groups: [],
};

type Values = SettingsSnapshot['values'];

/** Fields that matter only while another setting has a value, and are hidden otherwise. */
const SHOWN_WHEN: Readonly<Record<string, (values: Values) => boolean>> = {
  'network.proxyServer': (values) => values['network.proxyMode'] === 'manual',
};

/** Fields shown faded while another setting makes them matter less. */
const DIMMED_WHEN: Readonly<Record<string, (values: Values) => boolean>> = {
  'downloads.folder': (values) => values['downloads.askWhere'] === true,
};

/** Whether a field shows: main lists only the fields that do something on this platform. */
export const isShown = (id: string, values: Values): boolean =>
  id in values && (SHOWN_WHEN[id]?.(values) ?? true);

export const isDimmed = (id: string, values: Values): boolean => DIMMED_WHEN[id]?.(values) ?? false;

/** The pages before Backup this platform has: those with a setting here, and those of their own. */
export function shownPages(snapshot: SettingsSnapshot): readonly SettingsPage[] {
  return PAGES.filter((page) => {
    if (page.own !== undefined) {
      return `${page.own}.enabled` in snapshot.values;
    }
    return page.groups.some(({ ids }) => ids.some((id) => id in snapshot.values));
  });
}
