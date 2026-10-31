/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyChatListWidth,
  buildChatListDivider,
  chatListKey,
  chatListWidthRender,
  chooseChatListWidth,
  clampChatListWidth,
  measureChatList,
  placeChatListDivider,
  renderChatListWidth,
  sizeChatList,
  wireChatListDrag,
  wireChatListKeys,
  type ListContent,
} from './chat-list-width.ts';
import { LANDMARKS } from './page-state.ts';

const LABELS = { label: 'Chat list width', hint: 'Drag to resize' };

const PLACES = {
  side: '#side',
  store: 'list',
  bridge: 'bridge',
  style: '.divider { cursor: col-resize; }',
  min: 240,
  max: 4800,
  share: 0.6,
  step: 16,
};

const KIT = {
  build: buildChatListDivider,
  place: placeChatListDivider,
  apply: applyChatListWidth,
  drag: wireChatListDrag,
  keys: wireChatListKeys,
  choose: chooseChatListWidth,
  size: sizeChatList,
  measure: measureChatList,
  clamp: clampChatListWidth,
  key: chatListKey,
};

interface Stored {
  host: HTMLElement;
  divider: HTMLElement;
}

/** The layout widths happy-dom does not compute: the main screen's and the list's. */
const widths: Record<string, number> = {};

/**
 * WhatsApp's main screen as mapped (#79): a flex row whose list column is
 * sized with `flex`, followed by the conversation, which WhatsApp raises.
 */
function screen(column = 'flex: 0 0 30%; order: 2; z-index: 3'): string {
  return `<div id="screen" style="display: flex"><nav></nav><div id="column" style="${column}"><div id="side"></div></div><div id="conversation" style="z-index: 5"></div></div>`;
}

function setup(column?: string) {
  document.body.innerHTML = screen(column);
  const bridge = { resize: vi.fn(), reset: vi.fn() };
  const scope: Record<string, unknown> = { bridge, getComputedStyle };
  const render = (width: number | null = null): boolean =>
    renderChatListWidth(document, scope, { width, labels: LABELS }, PLACES, KIT);
  const stored = (): Stored => scope['list'] as Stored;
  render();
  const { divider } = stored();
  const capture = vi.fn();
  divider.setPointerCapture = capture;
  return { bridge, scope, render, stored, divider, capture };
}

function columnOf(): HTMLElement {
  const column = document.querySelector('#side')?.parentElement;
  if (column === null || column === undefined) {
    throw new Error('The fake page has no chat list column.');
  }
  return column;
}

/** An event as the user's own input makes it; page scripts can only make untrusted ones. */
function trusted<T extends Event>(event: T): T {
  Object.defineProperty(event, 'isTrusted', { value: true });
  return event;
}

const key = (name: string): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: name, bubbles: true, composed: true, cancelable: true });

const pointer = (type: string, clientX: number, button = 0): PointerEvent =>
  new PointerEvent(type, { clientX, button, pointerId: 7, bubbles: true, composed: true });

beforeEach(() => {
  widths['screen'] = 1000;
  widths['column'] = 300;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return { width: widths[this.id] ?? 0 } as DOMRect;
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('renderChatListWidth', () => {
  it('puts a labelled separator right after the list’s column, in a closed shadow root', () => {
    const t = setup();
    expect(t.render()).toBe(true);
    const { host, divider } = t.stored();
    expect(columnOf().nextElementSibling).toBe(host);
    expect(host.shadowRoot).toBeNull();
    const shadow = divider.getRootNode() as ShadowRoot;
    expect(shadow.querySelector('style')?.textContent).toBe('.divider { cursor: col-resize; }');
    expect(divider.className).toBe('divider');
    expect(divider.getAttribute('role')).toBe('separator');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.getAttribute('aria-label')).toBe('Chat list width');
    expect(divider.getAttribute('title')).toBe('Drag to resize');
    expect(divider.tabIndex).toBe(0);
    expect(
      ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map((name) => divider.getAttribute(name)),
    ).toEqual(['300', '240', '600']);
  });

  it('takes the column’s order and sits above both columns, render after render', () => {
    const t = setup();
    const { host } = t.stored();
    expect([host.style.order, host.style.position, host.style.zIndex]).toEqual([
      '2',
      'relative',
      '6',
    ]);
    document.querySelector('#conversation')?.remove();
    columnOf().setAttribute('style', 'order: 4');
    t.render();
    expect([host.style.order, host.style.zIndex]).toEqual(['4', '1']);
  });

  it('sizes the column within bounds, and gives WhatsApp back its own width', () => {
    const t = setup();
    const column = columnOf();
    t.render(320);
    expect(column.style.flex).toBe('0 0 320px');
    expect([column.style.minInlineSize, column.style.maxInlineSize]).toEqual(['240px', '60%']);
    t.render(360);
    expect(column.style.flex).toContain('360px');
    t.render(null);
    expect(column.style.flex).toBe('0 0 30%');
    expect([column.style.minInlineSize, column.style.maxInlineSize]).toEqual(['', '']);
    t.render(null);
    expect(column.style.flex).toContain('30%');
  });

  it('puts the same divider back, on the new column, when WhatsApp redraws its columns', () => {
    const t = setup();
    const { host } = t.stored();
    t.render(320);
    document.body.innerHTML = screen('flex: 0 0 25%');
    expect(t.render(320)).toBe(true);
    expect(columnOf().nextElementSibling).toBe(host);
    expect(columnOf().style.flex).toContain('320px');
    t.render(null);
    expect(columnOf().style.flex).toContain('25%');
  });

  it('takes the divider away while there is no chat list, and reports it', () => {
    const t = setup();
    const { host } = t.stored();
    document.querySelector('#side')?.remove();
    expect(t.render()).toBe(false);
    expect(host.isConnected).toBe(false);
    document.body.innerHTML = '';
    const scope: Record<string, unknown> = {};
    expect(renderChatListWidth(document, scope, { width: 320, labels: LABELS }, PLACES, KIT)).toBe(
      false,
    );
    expect(scope).toEqual({});
  });

  it('keeps the user’s pick until the main process sends it back', () => {
    const t = setup();
    t.render(300);
    t.divider.dispatchEvent(trusted(key('ArrowRight')));
    expect(columnOf().style.flex).toContain('316px');
    t.render(300);
    expect(columnOf().style.flex).toContain('316px');
    t.render(316);
    t.render(280);
    expect(columnOf().style.flex).toContain('280px');
  });

  it('leaves the width alone while the user drags', () => {
    const t = setup();
    t.divider.dispatchEvent(trusted(pointer('pointerdown', 300)));
    t.divider.dispatchEvent(trusted(pointer('pointermove', 350)));
    t.render(500);
    expect(columnOf().style.flex).toContain('350px');
  });
});

describe('the divider with the keyboard', () => {
  it('resizes with the arrows, Home and End, and goes back to WhatsApp’s width on Enter', () => {
    const t = setup();
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter'];
    for (const name of keys) {
      t.divider.dispatchEvent(trusted(key(name)));
    }
    expect(t.bridge.resize.mock.calls).toEqual([[316], [284], [240], [600]]);
    expect(t.bridge.reset).toHaveBeenCalledOnce();
  });

  it('widens the list with the left arrow in right-to-left layouts', () => {
    const t = setup('flex: 0 0 30%; direction: rtl');
    t.divider.dispatchEvent(trusted(key('ArrowLeft')));
    expect(t.bridge.resize).toHaveBeenCalledExactlyOnceWith(316);
  });

  it('ignores keys a page script made up, and other keys', () => {
    const t = setup();
    t.divider.dispatchEvent(key('ArrowRight'));
    const other = trusted(key('a'));
    t.divider.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(t.bridge.resize).not.toHaveBeenCalled();
  });

  it('keeps its keys from WhatsApp’s own keyboard shortcuts', () => {
    const t = setup();
    const heard = vi.fn();
    for (const type of ['keydown', 'keypress', 'keyup']) {
      document.addEventListener(type, heard);
      t.divider.dispatchEvent(
        new KeyboardEvent(type, { key: 'Home', bubbles: true, composed: true }),
      );
    }
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('the divider with the mouse', () => {
  it('follows the user’s drag, and keeps the width once the button goes up', () => {
    const t = setup();
    t.divider.dispatchEvent(trusted(pointer('pointerdown', 300)));
    expect(t.capture).toHaveBeenCalledWith(7);
    expect(document.activeElement).toBe(t.stored().host);
    t.divider.dispatchEvent(trusted(pointer('pointermove', 380)));
    expect(columnOf().style.flex).toContain('380px');
    expect(t.bridge.resize).not.toHaveBeenCalled();
    t.divider.dispatchEvent(trusted(pointer('pointermove', 2000)));
    t.divider.dispatchEvent(trusted(pointer('pointerup', 2000)));
    expect(t.bridge.resize).toHaveBeenCalledExactlyOnceWith(600);
    t.divider.dispatchEvent(trusted(pointer('pointermove', 100)));
    expect(columnOf().style.flex).toContain('600px');
  });

  it('drags the other way in right-to-left layouts, and stops at the narrowest', () => {
    const t = setup('flex: 0 0 30%; direction: rtl');
    t.divider.dispatchEvent(trusted(pointer('pointerdown', 300)));
    t.divider.dispatchEvent(trusted(pointer('pointermove', 250)));
    expect(columnOf().style.flex).toContain('350px');
    t.divider.dispatchEvent(trusted(pointer('pointermove', 900)));
    t.divider.dispatchEvent(trusted(pointer('pointercancel', 900)));
    expect(t.bridge.resize).toHaveBeenCalledExactlyOnceWith(240);
  });

  it('keeps nothing for a click that did not move', () => {
    const t = setup();
    t.divider.dispatchEvent(trusted(pointer('pointerdown', 300)));
    t.divider.dispatchEvent(trusted(pointer('pointerup', 300)));
    t.divider.dispatchEvent(trusted(pointer('pointerup', 300)));
    expect(t.bridge.resize).not.toHaveBeenCalled();
  });

  it('ignores pointer events a page script made up, and buttons other than the main one', () => {
    const t = setup();
    t.divider.dispatchEvent(pointer('pointerdown', 300));
    t.divider.dispatchEvent(trusted(pointer('pointerdown', 300, 2)));
    t.divider.dispatchEvent(trusted(pointer('pointermove', 400)));
    expect(t.capture).not.toHaveBeenCalled();
    t.divider.dispatchEvent(trusted(pointer('pointerdown', 300)));
    t.divider.dispatchEvent(pointer('pointermove', 500));
    t.divider.dispatchEvent(pointer('pointerup', 500));
    t.divider.dispatchEvent(trusted(pointer('pointermove', 400)));
    t.divider.dispatchEvent(trusted(pointer('pointerup', 400)));
    expect(t.bridge.resize).toHaveBeenCalledExactlyOnceWith(400);
  });

  it('goes back to WhatsApp’s own width on the user’s double-click only', () => {
    const t = setup();
    t.render(400);
    t.divider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.bridge.reset).not.toHaveBeenCalled();
    t.divider.dispatchEvent(trusted(new MouseEvent('dblclick', { bubbles: true })));
    expect(t.bridge.reset).toHaveBeenCalledOnce();
    expect(columnOf().style.flex).toContain('30%');
  });

  it('does nothing while the preload has not given the divider its bridge', () => {
    const t = setup();
    delete t.scope['bridge'];
    expect(() => {
      t.divider.dispatchEvent(trusted(key('End')));
      t.divider.dispatchEvent(trusted(key('Enter')));
    }).not.toThrow();
  });
});

describe('clampChatListWidth', () => {
  it.each([
    [100, 240],
    [320.4, 320],
    [9000, 600],
  ])('keeps %j to %j', (width, kept) => {
    expect(clampChatListWidth(width, { now: 300, min: 240, max: 600 })).toBe(kept);
  });
});

describe('measureChatList', () => {
  it('keeps the widest to the narrowest when WhatsApp has no room, or no width', () => {
    const column = document.createElement('div');
    const store = { column } as unknown as Parameters<typeof measureChatList>[0];
    expect(measureChatList(store, PLACES)).toEqual({ now: 0, min: 240, max: 240 });
    widths['screen'] = 100_000;
    const parent = document.createElement('div');
    parent.id = 'screen';
    parent.append(column);
    expect(measureChatList(store, PLACES).max).toBe(4800);
  });
});

describe('chatListKey', () => {
  const bounds = { now: 300, min: 240, max: 600 };

  it.each([
    ['ArrowRight', false, 316],
    ['ArrowLeft', false, 284],
    ['ArrowLeft', true, 316],
    ['ArrowRight', true, 284],
    ['Home', false, 240],
    ['End', false, 600],
    ['Enter', false, null],
    ['Tab', false, undefined],
    ['toString', false, undefined],
  ])('turns %s (right-to-left: %j) into %j', (name, rtl, width) => {
    expect(chatListKey(name, bounds, rtl, 16)).toBe(width);
  });

  it('stays within bounds', () => {
    expect(chatListKey('ArrowLeft', { now: 245, min: 240, max: 600 }, false, 16)).toBe(240);
    expect(chatListKey('ArrowRight', { now: 590, min: 240, max: 600 }, false, 16)).toBe(600);
  });
});

describe('chatListWidthRender', () => {
  const CONTENT: ListContent = { width: 320, labels: LABELS };

  it('sends the divider’s helpers, its place and its own styles along with the content', () => {
    const code = chatListWidthRender(CONTENT);
    expect(code).toMatch(/\{ build: [\s\S]+, place: [\s\S]+, key: [\s\S]+ \}\)$/);
    expect(code).toContain('"store":"yapyapChatListView"');
    expect(code).toContain('"bridge":"yapyapChatList"');
    expect(code).toContain('"min":240,"max":4800,"share":0.6,"step":16');
    expect(code).toContain('cursor: col-resize');
    expect(code).toContain(JSON.stringify(CONTENT));
  });

  // Mutation runs instrument the functions with calls to a module-level
  // helper, so only uninstrumented source can run on its own.
  it.skipIf(chatListWidthRender(CONTENT).includes('stryMutAct'))(
    'runs as standalone source text, keeping the divider in the world it runs in',
    () => {
      document.body.innerHTML = screen();
      const code = chatListWidthRender(CONTENT);
      expect(code).toContain(JSON.stringify(LANDMARKS.chatColumn));
      // Only the page's document and the window's own functions are in scope, as in the adapter's isolated world.
      const world: Record<string, unknown> = { document, getComputedStyle };
      expect(runInNewContext(code, world)).toBe(true);
      expect(columnOf().style.flex).toContain('320px');
      expect(columnOf().nextElementSibling?.tagName).toBe('DIV');
      expect(Object.keys(world)).toEqual(['document', 'getComputedStyle', 'yapyapChatListView']);
    },
  );
});
