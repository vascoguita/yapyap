import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';

/** A WhatsApp page the privacy screen can cover and uncover. */
export interface CoverablePage {
  insertCSS(css: string): Promise<string>;
  removeInsertedCSS(key: string): Promise<void>;
}

export interface PrivacyScreenDependencies {
  readonly settings: Pick<SettingsService, 'current' | 'onChange'>;
  /** Every account's WhatsApp page, read each time, so new accounts are covered too. */
  readonly pages: () => readonly CoverablePage[];
  readonly focused: () => boolean;
  /** Seconds since the user last used the computer. */
  readonly idleSeconds: () => number;
  readonly every: (callback: () => void, ms: number) => unknown;
  readonly onChange: () => void;
}

export interface PrivacyScreen {
  readonly covered: () => boolean;
  /** The tray's and the menu's switch: covers now, or uncovers what it covered. */
  readonly toggle: () => void;
  /** Looks again, as when the window gains or loses focus. */
  readonly update: () => void;
}

/**
 * Blurs the whole page and takes clicks away from it, so nothing behind the
 * screen can be read or clicked. It needs no knowledge of WhatsApp's page.
 */
const COVER_CSS =
  'html { filter: blur(18px) !important; pointer-events: none !important; user-select: none !important; }';

/** How long the computer must be idle before an idle screen covers WhatsApp. */
export const IDLE_SECONDS = 300;
const CHECK_MS = 5000;

function wanted(settings: Settings, focused: boolean, idle: number): boolean {
  const { blurWhenUnfocused, blurWhenIdle } = settings.privacy;
  return (blurWhenUnfocused && !focused) || (blurWhenIdle && idle >= IDLE_SECONDS);
}

/**
 * A privacy screen over every account's WhatsApp (#85): on demand from the
 * tray or the View menu, and, if the settings say so, while the window is
 * out of focus or the computer is idle. A manual screen stays until it is
 * switched off; an automatic one lifts when its reason does.
 */
export function createPrivacyScreen(deps: PrivacyScreenDependencies): PrivacyScreen {
  let manual = false;
  let covered = false;
  const keys = new Map<CoverablePage, Promise<string>>();
  const apply = (): void => {
    for (const page of deps.pages()) {
      const key = keys.get(page);
      if (covered && key === undefined) {
        keys.set(page, page.insertCSS(COVER_CSS));
      }
      if (!covered && key !== undefined) {
        keys.delete(page);
        void key.then((inserted) => page.removeInsertedCSS(inserted)).catch(() => undefined);
      }
    }
  };
  const update = (): void => {
    const next = manual || wanted(deps.settings.current(), deps.focused(), deps.idleSeconds());
    const changed = next !== covered;
    covered = next;
    apply();
    if (changed) {
      deps.onChange();
    }
  };
  deps.settings.onChange(update);
  deps.every(update, CHECK_MS);
  return {
    covered: () => covered,
    toggle: () => {
      manual = !covered;
      update();
    },
    update,
  };
}
