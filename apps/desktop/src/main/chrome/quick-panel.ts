import { argumentsOf, isBoolean } from '../ipc/arguments.ts';
import {
  CHROME_CHANNELS,
  SIDEBAR_STATE_EVENT,
  type SidebarState,
} from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { bringToFront, type LinkWindow } from '../instances.ts';
import type { Settings } from '../settings/schema.ts';
import type { Visibility } from '../window/visibility.ts';
import type { SettingsService } from '../settings/service.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import type { SidebarSource } from './sidebar.ts';
import type { ChromePage, ChromeWindowPort } from './window-opener.ts';
import type { TextFile } from '../atomic-write.ts';

export const QUICK_PANEL_PAGE: ChromePage = {
  path: 'quick-panel.html',
  window: {
    title: en.windows.quickPanel,
    width: 260,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // The setting turns it off; a close button would only make it come back.
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
  },
};

/** Room between the panel and the screen's edges. */
const MARGIN = 16;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PanelWindow extends ChromeWindowPort {
  readonly webContents: { send(channel: string, state: SidebarState): void };
  setPosition(x: number, y: number): void;
  getBounds(): Rect;
  on(event: 'moved', listener: () => void): unknown;
  destroy(): void;
}

/** Where the user last left the panel, kept as state rather than a setting. */
export interface PanelPlace {
  readonly get: () => Point | undefined;
  readonly set: (point: Point) => void;
}

export interface QuickPanelDependencies {
  readonly open: () => PanelWindow;
  readonly settings: Pick<SettingsService, 'current' | 'onChange' | 'update'>;
  /** Wayland places windows itself and never says where they are. */
  readonly wayland: boolean;
  /** The main screen's work area first, then the others'. */
  readonly workAreas: () => readonly Rect[];
  readonly place: PanelPlace;
}

const isCoordinate = (value: unknown): value is number =>
  Number.isInteger(value) && Math.abs(value as number) <= 100_000;

/** The panel's last place, from a small state file; anything unreadable counts as none. */
export function panelPlaceIn(file: TextFile): PanelPlace {
  let point: Point | undefined;
  try {
    const { x, y } = Object(JSON.parse(file.read())) as Record<string, unknown>;
    point = isCoordinate(x) && isCoordinate(y) ? { x, y } : undefined;
  } catch {
    point = undefined;
  }
  return {
    get: () => point,
    set: (next) => {
      point = next;
      file.write(JSON.stringify(next));
    },
  };
}

/** YapYap's main window, which the panel stands in for while it is hidden. */
export interface PanelOwner {
  readonly visible: () => boolean;
  readonly bringToFront: () => void;
}

type Place = Settings['general']['quickPanelPlace'];

const inside = (point: Point, size: Rect, area: Rect): boolean =>
  point.x >= area.x &&
  point.y >= area.y &&
  point.x + size.width <= area.x + area.width &&
  point.y + size.height <= area.y + area.height;

function cornerOf(place: Exclude<Place, 'free'>, size: Rect, main: Rect): Point {
  const left = place === 'topLeft' || place === 'bottomLeft';
  const top = place === 'topLeft' || place === 'topRight';
  return {
    x: left ? main.x + MARGIN : main.x + main.width - size.width - MARGIN,
    y: top ? main.y + MARGIN : main.y + main.height - size.height - MARGIN,
  };
}

/** The panel's corner of the main screen, or where the user left it if that is still on a screen. */
export function panelPosition(
  place: Place,
  size: Rect,
  areas: readonly Rect[],
  saved: Point | undefined,
): Point | undefined {
  const [main] = areas;
  if (place !== 'free' && main !== undefined) {
    return cornerOf(place, size, main);
  }
  return saved !== undefined && areas.some((area) => inside(saved, size, area)) ? saved : undefined;
}

/** YapYap's window as the panel's owner: a minimized window is out of sight too. */
export function panelOwner(
  window: LinkWindow,
  visibility: Pick<Visibility, 'onScreen'>,
): PanelOwner {
  return {
    visible: visibility.onScreen,
    bringToFront: () => {
      bringToFront(window);
    },
  };
}

const shown = (mode: Settings['general']['quickPanel'], ownerVisible: boolean): boolean =>
  mode === 'always' || (mode === 'whenHidden' && !ownerVisible);

interface PanelSlot {
  window: PanelWindow | undefined;
  owner?: PanelOwner;
  source?: SidebarSource;
}

/** Wayland gets no say from YapYap; elsewhere the panel goes to its place. */
function placePanel(deps: QuickPanelDependencies, window: PanelWindow): void {
  if (deps.wayland) {
    return;
  }
  const { quickPanelPlace } = deps.settings.current().general;
  const size = window.getBounds();
  const position = panelPosition(quickPanelPlace, size, deps.workAreas(), deps.place.get());
  if (position !== undefined) {
    window.setPosition(position.x, position.y);
  }
}

function openPanel(deps: QuickPanelDependencies): PanelWindow {
  const window = deps.open();
  placePanel(deps, window);
  window.on('moved', () => {
    if (!deps.wayland && deps.settings.current().general.quickPanelPlace === 'free') {
      const { x, y } = window.getBounds();
      deps.place.set({ x, y });
    }
  });
  return window;
}

/** The panel's window while it is open. */
const openWindow = (slot: PanelSlot): PanelWindow | undefined =>
  slot.window?.isDestroyed() === false ? slot.window : undefined;

/** Opens or closes the panel to match the setting and the main window, and shows it the accounts. */
function sync(deps: QuickPanelDependencies, slot: PanelSlot): void {
  const current = openWindow(slot);
  const wanted =
    slot.owner !== undefined &&
    shown(deps.settings.current().general.quickPanel, slot.owner.visible());
  if (!wanted) {
    // Closing is refused for a window that cannot be closed by hand.
    current?.destroy();
    slot.window = undefined;
    return;
  }
  if (current === undefined) {
    // The page asks for the accounts itself once it has loaded.
    slot.window = openPanel(deps);
    return;
  }
  if (slot.source !== undefined) {
    current.webContents.send(SIDEBAR_STATE_EVENT, slot.source.state);
  }
}

function quickPanelHandlers(deps: QuickPanelDependencies, slot: PanelSlot): ChromeHandler[] {
  const listed = (id: unknown): id is string =>
    slot.source?.state.accounts.some((account) => account.id === id) === true;
  return [
    {
      channel: CHROME_CHANNELS.quickPanelOpen,
      accepts: argumentsOf(listed),
      handle: (_call, id) => {
        slot.source?.switchTo(id as string);
        slot.owner?.bringToFront();
      },
    },
    {
      channel: CHROME_CHANNELS.quickPanelSetDoNotDisturb,
      accepts: argumentsOf(isBoolean),
      handle: (_call, on) => {
        deps.settings.update((current) => ({
          ...current,
          general: { ...current.general, doNotDisturb: on as boolean },
        }));
      },
    },
  ];
}

export interface QuickPanel {
  /** Follows the main window; returns how to show the panel the accounts. */
  readonly attach: (owner: PanelOwner) => (source: SidebarSource) => void;
  readonly handlers: readonly ChromeHandler[];
}

/**
 * The quick-access panel (#86): a small window on top of other apps that
 * switches accounts, bringing YapYap's window back, and turns Do not
 * disturb on or off. It is off unless the user turns it on.
 */
export function createQuickPanel(deps: QuickPanelDependencies): QuickPanel {
  const slot: PanelSlot = { window: undefined };
  let place = deps.settings.current().general.quickPanelPlace;
  deps.settings.onChange((settings) => {
    sync(deps, slot);
    const moved = settings.general.quickPanelPlace !== place;
    place = settings.general.quickPanelPlace;
    const current = openWindow(slot);
    if (moved && current !== undefined) {
      placePanel(deps, current);
    }
  });
  return {
    attach: (owner) => {
      slot.owner = owner;
      return (source) => {
        slot.source = source;
        sync(deps, slot);
      };
    },
    handlers: quickPanelHandlers(deps, slot),
  };
}
