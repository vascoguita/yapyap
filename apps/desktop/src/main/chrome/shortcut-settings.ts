import {
  CHROME_CHANNELS,
  type ShortcutChange,
  type ShortcutList,
} from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { conflictOf, isValidShortcut } from '../../shared/shortcut-keys.ts';
import { fitsShortcut, shortcutsFor, type ShortcutId } from '../../shared/shortcuts.ts';
import type { SettingsService } from '../settings/service.ts';
import { noArguments, type ChromeHandler } from './ipc.ts';

const text = en.shortcuts;

/** Longer than any real accelerator. */
const MAX_ACCELERATOR = 64;

type Service = Pick<SettingsService, 'current' | 'update' | 'readOnly'>;

/** New keys of a sane length, or null to go back to YapYap's own. */
const isKeysOrReset = (value: unknown): boolean =>
  value === null || (typeof value === 'string' && value.length <= MAX_ACCELERATOR);

/** Why the keys cannot be used for `id`, or '' when they can. */
function problemOf(
  service: Service,
  platform: string,
  id: ShortcutId,
  accelerator: string,
): string {
  if (!fitsShortcut(id, accelerator)) {
    return isValidShortcut(accelerator) ? text.switchEndsInOne : text.invalid;
  }
  const shortcuts = shortcutsFor(platform, service.current().shortcuts.custom);
  const taken = conflictOf(id, accelerator, shortcuts, platform);
  const other = shortcuts.find((shortcut) => shortcut.id === taken);
  return other === undefined ? '' : text.taken(other.label);
}

function save(service: Service, id: ShortcutId, accelerator: string | null): void {
  service.update((current) => {
    const others = Object.entries(current.shortcuts.custom).filter(([key]) => key !== id);
    const custom = Object.fromEntries(
      accelerator === null ? others : [...others, [id, accelerator]],
    );
    return { ...current, shortcuts: { ...current.shortcuts, custom } };
  });
}

/**
 * The Keyboard Shortcuts window's operations (#75): list the shortcuts, and
 * change or reset one. Keys that do not fit or that another action uses are
 * refused, with the reason; nothing is saved for a newer YapYap's file.
 */
export function shortcutHandlers(service: Service, platform: string): ChromeHandler[] {
  const list = (): ShortcutList => ({
    platform,
    shortcuts: shortcutsFor(platform, service.current().shortcuts.custom),
  });
  const known = new Set(list().shortcuts.map((shortcut) => shortcut.id));
  return [
    { channel: CHROME_CHANNELS.shortcutsList, accepts: noArguments, handle: list },
    {
      channel: CHROME_CHANNELS.shortcutsSet,
      accepts: ([id, accelerator, ...rest]) =>
        rest.length === 0 && known.has(id as ShortcutId) && isKeysOrReset(accelerator),
      handle: (_call, id, accelerator): ShortcutChange => {
        const shortcut = id as ShortcutId;
        const keys = accelerator as string | null;
        const problem = keys === null ? '' : problemOf(service, platform, shortcut, keys);
        if (problem === '' && !service.readOnly) {
          save(service, shortcut, keys);
        }
        return { ...list(), problem };
      },
    },
  ];
}
