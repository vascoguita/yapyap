import {
  CHROME_CHANNELS,
  type ExtensionShortcutState,
  type ShortcutChange,
  type ShortcutList,
} from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { conflictOf, isValidShortcut } from '../../shared/shortcut-keys.ts';
import {
  extensionShortcutKey,
  extensionShortcuts,
  fitsShortcut,
  GLOBAL_SHORTCUTS,
  shortcutsFor,
  type GlobalShortcutId,
  type ShortcutId,
} from '../../shared/shortcuts.ts';
import type { ExtensionCommand } from '../extensions/runtime.ts';
import type { SettingsService } from '../settings/service.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

const text = en.shortcuts;

/** Longer than any real accelerator. */
const MAX_ACCELERATOR = 64;

type Service = Pick<SettingsService, 'current' | 'update'>;

/** The running extensions' commands, in the order they started. */
type Commands = () => readonly ExtensionCommand[];

/** New keys of a sane length, or null to go back to YapYap's own. */
const isKeysOrReset = (value: unknown): boolean =>
  value === null || (typeof value === 'string' && value.length <= MAX_ACCELERATOR);

/** Extension commands go by `extension/command`; YapYap's own shortcuts have no `/`. */
const isExtension = (id: string): boolean => id.includes('/');

const isGlobal = (id: string): id is GlobalShortcutId =>
  GLOBAL_SHORTCUTS.some((shortcut) => shortcut.id === id);

/** Every binding in use: the in-app shortcuts, and the global ones that have keys. */
function bindingsOf(
  service: Service,
  platform: string,
): { id: string; label: string; accelerator: string }[] {
  const { custom, global } = service.current().shortcuts;
  const local = shortcutsFor(platform, custom);
  const everywhere = GLOBAL_SHORTCUTS.map(({ id, label }) => ({
    id,
    label,
    accelerator: global[id],
  }));
  return [...local, ...everywhere.filter(({ accelerator }) => accelerator !== '')];
}

/** The extension commands as the Keyboard Shortcuts window lists them, with the keys they have. */
function extensionStates(
  service: Service,
  platform: string,
  commands: Commands,
): ExtensionShortcutState[] {
  const { custom, extensions: chosen } = service.current().shortcuts;
  const running = commands();
  const given = extensionShortcuts(running, platform, custom, chosen);
  return running.map(({ extension, extensionName, id, title, shortcut }) => {
    const key = extensionShortcutKey(extension, id);
    return {
      id: key,
      label: en.menu.extensionCommand({ extension: extensionName, title }),
      accelerator: given.get(key) ?? '',
      suggested: shortcut ?? '',
      custom: key in chosen,
    };
  });
}

/** Why the keys cannot be used for `id`, or '' when they can. */
function problemOf(
  service: Service,
  platform: string,
  id: string,
  accelerator: string,
  commands: Commands,
): string {
  const fits =
    isGlobal(id) || isExtension(id)
      ? isValidShortcut(accelerator)
      : fitsShortcut(id as ShortcutId, accelerator);
  if (!fits) {
    return isValidShortcut(accelerator) ? text.switchEndsInOne : text.invalid;
  }
  const bindings = [
    ...bindingsOf(service, platform),
    ...extensionStates(service, platform, commands).filter(({ accelerator: keys }) => keys !== ''),
  ];
  const taken = conflictOf(id, accelerator, bindings, platform);
  const other = bindings.find((binding) => binding.id === taken);
  return other === undefined ? '' : text.taken({ action: other.label });
}

function save(service: Service, id: string, accelerator: string | null): void {
  service.update((current) => {
    if (isExtension(id)) {
      const kept = Object.entries(current.shortcuts.extensions).filter(([key]) => key !== id);
      const extensions = Object.fromEntries(
        accelerator === null ? kept : [...kept, [id, accelerator]],
      );
      return { ...current, shortcuts: { ...current.shortcuts, extensions } };
    }
    if (isGlobal(id)) {
      const global = { ...current.shortcuts.global, [id]: accelerator ?? '' };
      return { ...current, shortcuts: { ...current.shortcuts, global } };
    }
    const others = Object.entries(current.shortcuts.custom).filter(([key]) => key !== id);
    const custom = Object.fromEntries(
      accelerator === null ? others : [...others, [id, accelerator]],
    );
    return { ...current, shortcuts: { ...current.shortcuts, custom } };
  });
}

/** Every shortcut as the Keyboard Shortcuts window shows it. */
function listOf(
  service: Service,
  platform: string,
  isRegistered: (accelerator: string) => boolean,
  commands: Commands,
): ShortcutList {
  const { custom, global } = service.current().shortcuts;
  return {
    platform,
    shortcuts: shortcutsFor(platform, custom),
    global: GLOBAL_SHORTCUTS.map(({ id, label }) => ({
      id,
      label,
      accelerator: global[id],
      registered: global[id] === '' || isRegistered(global[id]),
    })),
    extensions: extensionStates(service, platform, commands),
  };
}

/**
 * The Keyboard Shortcuts window's operations (#75): list the shortcuts, and
 * change or reset one, in-app, global, or of an extension's command (#443).
 * Keys that do not fit or that another action uses are refused, with the
 * reason. A global shortcut also says whether the system granted its keys.
 * An extension command's keys can also be removed (empty keys), and reset
 * goes back to its suggestion.
 */
export function shortcutHandlers(
  service: Service,
  platform: string,
  isRegistered: (accelerator: string) => boolean,
  commands: Commands,
): ChromeHandler[] {
  const list = (): ShortcutList => listOf(service, platform, isRegistered, commands);
  const known = new Set<string>([
    ...list().shortcuts.map((shortcut) => shortcut.id),
    ...GLOBAL_SHORTCUTS.map((shortcut) => shortcut.id),
  ]);
  const knows = (id: string): boolean =>
    known.has(id) ||
    commands().some((command) => extensionShortcutKey(command.extension, command.id) === id);
  // Reset never clashes, and removing an extension command's keys frees them.
  const problemFor = (id: string, keys: string | null): string =>
    keys === null || (keys === '' && isExtension(id))
      ? ''
      : problemOf(service, platform, id, keys, commands);
  return [
    { channel: CHROME_CHANNELS.shortcutsList, accepts: noArguments, handle: list },
    {
      channel: CHROME_CHANNELS.shortcutsSet,
      accepts: argumentsOf((id) => knows(String(id)), isKeysOrReset),
      handle: (_call, id, accelerator): ShortcutChange => {
        const keys = accelerator as string | null;
        const problem = problemFor(String(id), keys);
        if (problem === '') {
          save(service, String(id), keys);
        }
        return { ...list(), problem };
      },
    },
  ];
}
