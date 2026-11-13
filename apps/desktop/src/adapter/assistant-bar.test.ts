/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alignAssistantBar,
  assistantBarIcon,
  assistantBarNode,
  assistantBarRender,
  assistantBarRows,
  buildAssistantBar,
  holdAssistantBarRoom,
  noticeAssistantBar,
  renderAssistantBar,
  showAssistantBar,
  updateAssistantBar,
  wireAssistantBar,
  type BarContent,
  type BarPlacement,
} from './assistant-bar.ts';
import { ASSISTANT_ICONS } from './assistant-look.ts';
import { LANDMARKS } from './page-state.ts';

const LABELS = {
  label: 'AI assistant',
  suggestions: 'Suggested replies',
  use: 'Puts this reply in the message box.',
  dismiss: 'Dismiss suggestions',
  close: 'Close',
};

const CONTENT: BarContent = {
  visible: true,
  labels: LABELS,
  suggestions: ['On my way', '<b>Soon</b>'],
  notice: null,
};

const UNDO: BarContent = {
  ...CONTENT,
  suggestions: [],
  notice: { text: 'Softened. Edit it or send as is.', button: { id: 'undo', label: 'Undo' } },
};

const PLACES = {
  footer: '#main footer',
  field: '#main footer [contenteditable="true"]',
  conversation: '#main',
  message: '#main [data-id]',
  store: 'bar',
  bridge: 'bridge',
  style: '.bar { display: flex; }',
  icons: { sparkle: 'M1 1z', close: 'M2 2z' },
};

const KIT = {
  align: alignAssistantBar,
  room: holdAssistantBarRoom,
  build: buildAssistantBar,
  rows: assistantBarRows,
  node: assistantBarNode,
  show: showAssistantBar,
  wire: wireAssistantBar,
  update: updateAssistantBar,
  notice: noticeAssistantBar,
  icon: assistantBarIcon,
};

interface Stored {
  host: HTMLElement;
  key: string | null;
  parts: {
    bar: HTMLElement;
    notice: HTMLElement;
    text: HTMLElement;
    action: HTMLButtonElement;
    close: HTMLButtonElement;
    chips: HTMLElement;
    list: HTMLElement;
    dismiss: HTMLButtonElement;
  };
}

/** WhatsApp's message box, which orders the chat's parts with flexbox `order` and raises itself (#466). */
const FOOTER =
  '<footer style="order: 3; z-index: 2; color: rgb(17, 27, 33)"><div contenteditable="true"></div></footer>';

/** A chat with its message box, the scope the adapter world would be, and the bar's bridge. */
function setup() {
  document.body.innerHTML = `<div id="main"><div role="row">Hi</div>${FOOTER}</div>`;
  const bridge = { use: vi.fn(), dismiss: vi.fn(), button: vi.fn() };
  const scope: Record<string, unknown> = { bridge, getComputedStyle };
  const render = (content: BarContent = CONTENT): BarPlacement =>
    renderAssistantBar(document, scope, content, PLACES, KIT);
  const stored = (): Stored => scope['bar'] as Stored;
  // The test reaches into the closed shadow root through the parts the adapter keeps.
  const shadow = (): ShadowRoot => stored().parts.bar.getRootNode() as ShadowRoot;
  const chips = (): HTMLButtonElement[] => [
    ...stored().parts.list.querySelectorAll<HTMLButtonElement>('.chip'),
  ];
  return { bridge, scope, render, stored, shadow, chips };
}

/** An event as the user's own input makes it; page scripts can only make untrusted ones. */
function trusted<T extends Event>(event: T): T {
  Object.defineProperty(event, 'isTrusted', { value: true });
  return event;
}

const click = (target: Element): void => {
  target.dispatchEvent(trusted(new MouseEvent('click', { bubbles: true })));
};

const footer = (): Element | null => document.querySelector('#main footer');
const field = (): HTMLElement | null => document.querySelector('[contenteditable]');

/** Types in WhatsApp's message box, as the user does: its text changes, then an input event. */
function type(text: string): void {
  const box = field();
  if (box === null) {
    throw new Error('No message box.');
  }
  box.textContent = text;
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('renderAssistantBar', () => {
  it('puts the bar right above the message box, in a closed shadow root', () => {
    const t = setup();
    expect(t.render()).toBe('placed');
    const { host } = t.stored();
    expect(footer()?.previousElementSibling).toBe(host);
    expect(host.shadowRoot).toBeNull();
    expect(t.render()).toBe('kept');
    const shadow = t.shadow();
    expect(shadow.querySelector('style')?.textContent).toBe('.bar { display: flex; }');
    expect(shadow.querySelector('.bar')?.getAttribute('aria-label')).toBe('AI assistant');
    expect(t.stored().parts.chips.getAttribute('aria-label')).toBe('Suggested replies');
    expect(t.stored().parts.notice.getAttribute('role')).toBe('status');
  });

  it('gives every part the class its styles use', () => {
    const t = setup();
    t.render();
    const { parts } = t.stored();
    const classes = Object.entries(parts).map(([part, node]) => [part, node.getAttribute('class')]);
    expect(classes).toEqual([
      ['bar', 'bar'],
      ['notice', 'row notice'],
      ['text', 'text'],
      ['action', 'action'],
      ['close', 'icon'],
      ['chips', 'row chips'],
      ['list', 'list'],
      ['dismiss', 'icon'],
    ]);
    expect(parts.list.tagName).toBe('UL');
  });

  it('gives buttons their action and button attributes, and nothing else either', () => {
    const t = setup();
    t.render();
    const { parts } = t.stored();
    expect(parts.action.dataset['action']).toBe('button');
    expect(parts.close.dataset).toMatchObject({ action: 'button', id: 'close' });
    expect(parts.dismiss.dataset['action']).toBe('dismiss');
    for (const button of [parts.action, parts.close, parts.dismiss]) {
      expect(button.getAttribute('type')).toBe('button');
    }
    expect(parts.text.hasAttribute('type')).toBe(false);
    expect(parts.text.dataset['action']).toBeUndefined();
  });

  it('starts each row with the sparkle, and draws a cross to close or dismiss', () => {
    const t = setup();
    t.render();
    const { parts } = t.stored();
    const drawn = (svg: Element | null) => [
      svg?.getAttribute('class'),
      svg?.getAttribute('aria-hidden'),
      svg?.querySelector('path')?.getAttribute('d'),
    ];
    for (const row of [parts.notice, parts.chips]) {
      expect(drawn(row.firstElementChild)).toEqual(['mark', 'true', 'M1 1z']);
    }
    for (const button of [parts.close, parts.dismiss]) {
      expect(drawn(button.querySelector('svg'))).toEqual(['cross', 'true', 'M2 2z']);
    }
  });

  it('names the controls that show only an icon', () => {
    const t = setup();
    t.render();
    const { close, dismiss } = t.stored().parts;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss suggestions');
    expect(dismiss.getAttribute('title')).toBe('Dismiss suggestions');
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(close.getAttribute('title')).toBe('Close');
  });

  it('takes the message box’s place in WhatsApp’s layout, and its theme, render after render', () => {
    const t = setup();
    t.render();
    const { host } = t.stored();
    expect(host.style.order).toBe('3');
    expect(host.style.position).toBe('relative');
    expect(host.style.zIndex).toBe('2');
    expect(host.dataset['theme']).toBe('light');
    footer()?.setAttribute('style', 'order: 5; z-index: 4; color: rgb(233, 237, 239)');
    t.render();
    expect(host.style.order).toBe('5');
    expect(host.style.zIndex).toBe('4');
    expect(host.dataset['theme']).toBe('dark');
  });

  it('writes the assistant’s text as text, never as markup', () => {
    const t = setup();
    t.render();
    expect(t.chips().map((chip) => chip.textContent)).toEqual(['On my way', '<b>Soon</b>']);
    expect(t.shadow().querySelector('b')).toBeNull();
    t.render({
      ...CONTENT,
      notice: { text: '<i>Hi</i>', button: { id: 'fix', label: '<u>Fix</u>' } },
    });
    expect(t.stored().parts.text.textContent).toBe('<i>Hi</i>');
    expect(t.stored().parts.action.textContent).toBe('<u>Fix</u>');
    expect(t.shadow().querySelector('i, u')).toBeNull();
  });

  it('makes each suggestion a chip that names it, and how it is used', () => {
    const t = setup();
    t.render();
    const described = t.chips().map((chip) => ({
      tag: chip.tagName,
      item: chip.parentElement?.tagName,
      class: chip.getAttribute('class'),
      type: chip.getAttribute('type'),
      title: chip.getAttribute('title'),
      action: chip.dataset['action'],
      index: chip.dataset['index'],
    }));
    const chip = { tag: 'BUTTON', item: 'LI', class: 'chip', type: 'button', action: 'use' };
    expect(described).toEqual([
      { ...chip, title: 'On my way\nPuts this reply in the message box.', index: '0' },
      { ...chip, title: '<b>Soon</b>\nPuts this reply in the message box.', index: '1' },
    ]);
  });

  it('shows a notice with Undo, and no close beside it', () => {
    const t = setup();
    t.render(UNDO);
    const { notice, text, action, close, chips } = t.stored().parts;
    expect(notice.hidden).toBe(false);
    expect(text.textContent).toBe('Softened. Edit it or send as is.');
    expect(action.hidden).toBe(false);
    expect(action.textContent).toBe('Undo');
    expect(action.dataset['id']).toBe('undo');
    expect(close.hidden).toBe(true);
    expect(chips.hidden).toBe(true);
  });

  it('shows close beside any other notice, with or without a button', () => {
    const t = setup();
    t.render({ ...UNDO, notice: { text: 'Paste your key.', button: { id: 'fix', label: 'Fix' } } });
    const { notice, text, action, close } = t.stored().parts;
    expect(action.dataset['id']).toBe('fix');
    expect(close.hidden).toBe(false);
    t.render({ ...UNDO, notice: { text: 'Try again.', button: null } });
    expect(action.hidden).toBe(true);
    expect(action.textContent).toBe('');
    expect(action.dataset['id']).toBe('');
    expect(close.hidden).toBe(false);
    t.render({ ...UNDO, notice: null });
    expect(notice.hidden).toBe(true);
    expect(text.textContent).toBe('');
    expect(action.hidden).toBe(true);
  });

  it('shows nothing at all with neither suggestions nor a notice', () => {
    const t = setup();
    t.render({ ...CONTENT, suggestions: [] });
    expect(t.stored().host.style.display).toBe('none');
    expect(t.stored().parts.chips.hidden).toBe(true);
    t.render(UNDO);
    expect(t.stored().host.style.display).toBe('');
    t.render();
    expect(t.stored().host.style.display).toBe('');
    expect(t.stored().parts.chips.hidden).toBe(false);
  });

  it('hides the suggestions while the user types, and shows them again once the box is empty', () => {
    const t = setup();
    t.render();
    const { host, parts } = t.stored();
    type('Hello');
    expect(parts.chips.hidden).toBe(true);
    expect(host.style.display).toBe('none');
    type('  ');
    expect(parts.chips.hidden).toBe(false);
    expect(host.style.display).toBe('');
    // A draft already there when the bar renders hides them too, and a notice still shows.
    field()?.replaceChildren('Hi');
    t.render({ ...UNDO, suggestions: ['Sure'] });
    expect(parts.chips.hidden).toBe(true);
    expect(parts.notice.hidden).toBe(false);
    expect(host.style.display).toBe('');
  });

  it('shows the suggestions over a message box it cannot find the field of', () => {
    const t = setup();
    field()?.remove();
    t.render();
    expect(t.stored().parts.chips.hidden).toBe(false);
  });

  it('listens to the page’s typing only once, however often it renders', () => {
    const listen = vi.spyOn(document, 'addEventListener');
    const t = setup();
    t.render();
    t.render(UNDO);
    expect(listen).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith('input', expect.any(Function), true);
  });

  it('changes nothing when nothing changed, and updates in place when something did', () => {
    const t = setup();
    t.render();
    const { host, parts } = t.stored();
    const first = t.chips()[0];
    t.render();
    expect(t.chips()[0]).toBe(first);
    expect(t.stored().key).toBe(JSON.stringify(CONTENT));
    t.render({ ...CONTENT, suggestions: ['Later'] });
    expect(t.stored().host).toBe(host);
    expect(t.stored().parts.list).toBe(parts.list);
    expect(t.chips().map((chip) => chip.textContent)).toEqual(['Later']);
  });

  it('puts the same bar back when WhatsApp redraws the chat, and above the new message box', () => {
    const t = setup();
    t.render();
    const { host } = t.stored();
    const main = document.querySelector('#main');
    if (main !== null) {
      main.innerHTML = `<div role="row">Hi</div>${FOOTER}`;
    }
    expect(host.isConnected).toBe(false);
    expect(t.render()).toBe('placed');
    expect(t.stored().host).toBe(host);
    expect(footer()?.previousElementSibling).toBe(host);
  });

  it('takes the bar away when it is hidden or no chat is open, and reports it', () => {
    const t = setup();
    expect(t.render({ ...CONTENT, visible: false })).toBe('away');
    expect(t.scope['bar']).toBeUndefined();
    t.render();
    expect(t.render({ ...CONTENT, visible: false })).toBe('away');
    expect(t.stored().host.isConnected).toBe(false);
    t.render();
    footer()?.remove();
    expect(t.render()).toBe('away');
    expect(t.stored().host.isConnected).toBe(false);
  });
});

describe('alignAssistantBar', () => {
  it('reads a dark theme from light text, and a light one from dark text or a color it cannot read', () => {
    const host = document.createElement('div');
    const align = (color: string) => {
      const computed = () => ({ order: '1', zIndex: '1', color });
      alignAssistantBar({ getComputedStyle: computed }, host as never, host as never);
      return host.dataset['theme'];
    };
    expect(align('rgb(233, 237, 239)')).toBe('dark');
    expect(align('rgba(250, 250, 250, 0.9)')).toBe('dark');
    expect(align('rgb(17, 27, 33)')).toBe('light');
    // Just at the middle grey still reads as dark text.
    expect(align('rgb(128, 128, 128)')).toBe('light');
    expect(align('rgb(129, 129, 129)')).toBe('dark');
    // Green weighs most, then red, then blue.
    expect(align('rgb(0, 220, 0)')).toBe('dark');
    expect(align('rgb(255, 0, 0)')).toBe('light');
    expect(align('rgb(0, 0, 255)')).toBe('light');
    expect(align('rgb(100, 100, 255)')).toBe('light');
    expect(align('rgb(120, 140, 255)')).toBe('dark');
    expect(align('rgb(255, 140, 40)')).toBe('dark');
    expect(align('')).toBe('light');
    expect(align('rgb(250)')).toBe('light');
    expect(align('rgb(250, 250)')).toBe('dark');
  });
});

/**
 * Lays `list` out as a browser would, which the test DOM does not: 1000 px
 * of messages in a box 600 px tall less the bar's height, which never
 * scrolls past the end of the chat, so a box that grows pulls a list
 * scrolled to its end back by itself.
 */
function layOut(list: HTMLElement, barHeight: () => number): void {
  let top = 0;
  const end = (): number => Math.max(0, 1000 - (600 - barHeight()));
  Object.defineProperties(list, {
    scrollHeight: { get: () => 1000 },
    clientHeight: { get: () => 600 - barHeight() },
    scrollTop: {
      get: () => {
        top = Math.min(top, end());
        return top;
      },
      set: (value: number) => {
        top = Math.max(0, Math.min(value, end()));
      },
    },
  });
}

/** WhatsApp's chat as it scrolls: its messages in a box of their own, above the message box. */
function scrollingChat(barHeight: () => number): HTMLElement {
  document.body.innerHTML = `<div id="main"><div style="overflow-y: auto"><div><div data-id="3EB0F1">Hi</div></div></div>${FOOTER}</div>`;
  const list = document.querySelector<HTMLElement>('#main > div');
  if (list === null) {
    throw new Error('No message list.');
  }
  layOut(list, barHeight);
  return list;
}

/** How far a list is from the end of its chat; 0 shows the last message. */
const fromEnd = (list: HTMLElement): number =>
  list.scrollHeight - list.scrollTop - list.clientHeight;

/**
 * Gives the bar a height once it shows, as its rows would: 50 px for each
 * row that shows. The test DOM lays nothing out.
 */
function barHeights() {
  return vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    const host = (this.getRootNode() as ShadowRoot).host as HTMLElement | undefined;
    if (this.getAttribute('class') !== 'bar' || host?.isConnected !== true) {
      return 0;
    }
    if (host.style.display === 'none') {
      return 0;
    }
    const rows = [...this.querySelectorAll<HTMLElement>('.row')];
    return rows.filter((row) => !row.hidden).length * 50;
  });
}

describe('holdAssistantBarRoom', () => {
  type Bar = Parameters<typeof holdAssistantBarRoom>[2];
  /** A bar `height` tall, which the list's layout reads. */
  function bar(height: number) {
    const node = { offsetHeight: height, ownerDocument: document } as unknown as Bar;
    const resize = (next: number) => () => {
      Object.assign(node, { offsetHeight: next });
    };
    return { node, height: () => node.offsetHeight, resize };
  }

  it('keeps a chat read to its end at its end, as the bar grows and as it shrinks', () => {
    const b = bar(0);
    const list = scrollingChat(b.height);
    list.scrollTop = 1000;
    expect(list.scrollTop).toBe(400);
    holdAssistantBarRoom({ getComputedStyle }, PLACES, b.node, b.resize(100));
    expect([list.scrollTop, fromEnd(list)]).toEqual([500, 0]);
    // The list grows back as the bar goes, as when a suggestion is picked (#616).
    holdAssistantBarRoom({ getComputedStyle }, PLACES, b.node, b.resize(0));
    expect([list.scrollTop, fromEnd(list)]).toEqual([400, 0]);
  });

  it('keeps a chat scrolled back through its history where the user left it', () => {
    const b = bar(0);
    const list = scrollingChat(b.height);
    list.scrollTop = 100;
    expect(fromEnd(list)).toBe(300);
    holdAssistantBarRoom({ getComputedStyle }, PLACES, b.node, b.resize(150));
    expect([list.scrollTop, fromEnd(list)]).toEqual([250, 300]);
    holdAssistantBarRoom({ getComputedStyle }, PLACES, b.node, b.resize(50));
    expect([list.scrollTop, fromEnd(list)]).toEqual([150, 300]);
  });

  it('scrolls nothing outside the open chat', () => {
    const b = bar(0);
    const list = scrollingChat(b.height);
    list.scrollTop = 200;
    // A page that scrolls around a chat whose messages do not is not the message list.
    list.style.overflowY = 'visible';
    document.body.style.overflowY = 'auto';
    document.body.scrollTop = 10;
    const change = vi.fn(b.resize(80));
    holdAssistantBarRoom({ getComputedStyle }, PLACES, b.node, change);
    expect(change).toHaveBeenCalledOnce();
    expect([list.scrollTop, document.body.scrollTop]).toEqual([200, 10]);
  });

  it('follows a list that scrolls always, as well as one that scrolls when it must', () => {
    const b = bar(0);
    const list = scrollingChat(b.height);
    list.style.overflowY = 'scroll';
    list.scrollTop = 400;
    holdAssistantBarRoom({ getComputedStyle }, PLACES, b.node, b.resize(30));
    expect(fromEnd(list)).toBe(0);
  });

  it('makes the change in a chat with no messages', () => {
    document.body.innerHTML = '<div id="main" style="overflow-y: auto"><footer></footer></div>';
    const b = bar(0);
    const change = vi.fn(b.resize(80));
    holdAssistantBarRoom({ getComputedStyle }, PLACES, b.node, change);
    expect(change).toHaveBeenCalledOnce();
  });

  it('keeps the last message in view as the bar shows, grows, hides and shows again', () => {
    const measured = barHeights();
    const t = setup();
    // Before the first render, there is no bar yet.
    const list = scrollingChat(
      () => (t.scope['bar'] as Stored | undefined)?.parts.bar.offsetHeight ?? 0,
    );
    list.scrollTop = 1000;
    expect(t.render()).toBe('placed');
    expect(fromEnd(list)).toBe(0);
    expect(list.scrollTop).toBe(450);
    // Rendering the same content again scrolls nothing.
    expect(t.render()).toBe('kept');
    expect(list.scrollTop).toBe(450);
    t.render({ ...CONTENT, notice: { text: 'Try again.', button: null } });
    expect([list.scrollTop, fromEnd(list)]).toEqual([500, 0]);
    type('Hi');
    expect([list.scrollTop, fromEnd(list)]).toEqual([450, 0]);
    // Typing more changes nothing that shows, so nothing is measured or scrolled.
    measured.mockClear();
    type('Hi there');
    expect(measured).not.toHaveBeenCalled();
    expect(list.scrollTop).toBe(450);
    type('');
    expect([list.scrollTop, fromEnd(list)]).toEqual([500, 0]);
    // Picking a suggestion takes the row away, and the last message stays in view (#616).
    t.render({ ...CONTENT, suggestions: [], notice: null });
    expect(fromEnd(list)).toBe(0);
  });
});

describe('the bar’s controls', () => {
  it('act on the user’s clicks only, never on clicks a page script made up', () => {
    const t = setup();
    t.render();
    const [, second] = t.chips();
    second?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    t.stored().parts.dismiss.click();
    expect(t.bridge.use).not.toHaveBeenCalled();
    expect(t.bridge.dismiss).not.toHaveBeenCalled();
    if (second !== undefined) {
      click(second);
    }
    expect(t.bridge.use).toHaveBeenCalledExactlyOnceWith(1);
    click(t.stored().parts.dismiss);
    expect(t.bridge.dismiss).toHaveBeenCalledOnce();
    expect(t.bridge.dismiss.mock.calls[0]).toEqual([]);
  });

  it('pass on the notice’s button and close by their IDs', () => {
    const t = setup();
    t.render(UNDO);
    click(t.stored().parts.action);
    expect(t.bridge.button).toHaveBeenLastCalledWith('undo');
    click(t.stored().parts.close);
    expect(t.bridge.button).toHaveBeenLastCalledWith('close');
    expect(t.bridge.button).toHaveBeenCalledTimes(2);
  });

  it('do nothing on a click beside the controls', () => {
    const t = setup();
    t.render(UNDO);
    click(t.stored().parts.text);
    click(t.stored().parts.bar);
    expect(t.bridge.button).not.toHaveBeenCalled();
    expect(t.bridge.use).not.toHaveBeenCalled();
    expect(t.bridge.dismiss).not.toHaveBeenCalled();
  });

  it('keep keys pressed on the bar from reaching WhatsApp’s own keyboard handlers', () => {
    const t = setup();
    t.render();
    const heard = vi.fn();
    document.addEventListener('keydown', heard);
    t.chips()[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(heard).not.toHaveBeenCalled();
    document.removeEventListener('keydown', heard);
  });

  it('do nothing while the preload has not given the bar its bridge', () => {
    const t = setup();
    delete t.scope['bridge'];
    t.render(UNDO);
    expect(() => {
      click(t.stored().parts.action);
    }).not.toThrow();
  });
});

describe('assistantBarRender', () => {
  it('sends the bar’s helpers, its place, icons and its own styles along with the content', () => {
    const code = assistantBarRender(CONTENT);
    expect(code).toMatch(
      /\{ align: [\s\S]+, room: [\s\S]+, build: [\s\S]+, rows: [\s\S]+, node: [\s\S]+, show: [\s\S]+, wire: [\s\S]+, update: [\s\S]+, notice: [\s\S]+, icon: [\s\S]+ \}\)$/,
    );
    expect(code).toContain('"store":"yapyapAssistantBarView"');
    expect(code).toContain('"bridge":"yapyapAssistantBar"');
    expect(code).toContain(`"field":${JSON.stringify(LANDMARKS.composer)}`);
    expect(code).toContain(`"conversation":${JSON.stringify(LANDMARKS.conversation)}`);
    expect(code).toContain(`"message":${JSON.stringify(LANDMARKS.message)}`);
    expect(code).toContain(`"sparkle":${JSON.stringify(ASSISTANT_ICONS.sparkle)}`);
    expect(code).toContain(`"close":${JSON.stringify(ASSISTANT_ICONS.close)}`);
    // The assistant's own accent, in both of WhatsApp's themes, then the bar's styles.
    expect(code).toContain('--ai: #4f46e5');
    expect(code).toContain(":host([data-theme='dark'])");
    expect(code).toContain(':host { display: block; }');
    expect(code).toContain(JSON.stringify(CONTENT));
  });

  // Mutation runs instrument the functions with calls to a module-level
  // helper, so only uninstrumented source can run on its own.
  it.skipIf(assistantBarRender(CONTENT).includes('stryMutAct'))(
    'runs as standalone source text, keeping the bar in the world it runs in',
    () => {
      document.body.innerHTML = `<div id="main">${FOOTER}</div>`;
      const code = assistantBarRender(CONTENT);
      expect(code).toContain(JSON.stringify(LANDMARKS.composerFooter));
      // Only the page's document and the window's own functions are in scope, as in the adapter's isolated world.
      const world: Record<string, unknown> = { document, getComputedStyle };
      expect(runInNewContext(code, world)).toBe('placed');
      expect(footer()?.previousElementSibling?.tagName).toBe('DIV');
      expect(Object.keys(world)).toEqual([
        'document',
        'getComputedStyle',
        'yapyapAssistantBarView',
      ]);
    },
  );
});
