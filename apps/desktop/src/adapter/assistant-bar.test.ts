/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fitAssistantTray,
  assistantBoxSquared,
  assistantQuoteLayer,
  joinAssistantBar,
  listenToAssistantPage,
  squareAssistantBox,
  raiseAssistantQuote,
  actOnAssistantBar,
  alignAssistantBar,
  assistantSummaryCard,
  assistantSummarySections,
  closeAssistantSummary,
  fitAssistantSummary,
  summaryAssistantBar,
  assistantTrayBox,
  assistantBarHere,
  assistantBarHidden,
  assistantBarRender,
  assistantBarRows,
  buildAssistantBar,
  holdAssistantBarRoom,
  markAssistantBar,
  noticeAssistantBar,
  refreshAssistantBar,
  renderAssistantBar,
  showAssistantBar,
  updateAssistantBar,
  wireAssistantBar,
  type BarContent,
  type BarPlacement,
} from './assistant-bar.ts';
import { edgeTurn } from '../shared/working-edge.ts';
import { ASSISTANT_ICONS } from './assistant-look.ts';
import { paintWhatsAppTheme, shadowPart, strokeIcon } from './page-kit.ts';
import { fingerprint } from './incoming.ts';
import { LANDMARKS } from './page-state.ts';

const LABELS = {
  label: 'AI Assistant',
  suggestions: 'Suggested replies',
  use: 'Puts this reply in the message box.',
  collapse: 'Hide suggestions',
  expand: 'Show suggestions',
  folded: 'Suggestions',
  writing: 'Writing suggestions…',
  close: 'Close',
  summarizing: 'Writing the summary…',
  closeSummary: 'Close Summary',
};

const CONTENT: BarContent = {
  visible: true,
  labels: LABELS,
  suggestions: ['On my way', '<b>Soon</b>'],
  notice: null,
  chat: null,
  collapsed: false,
  writing: false,
  summary: null,
};

const UNDO: BarContent = {
  ...CONTENT,
  suggestions: [],
  notice: { text: 'Softened. Edit it or send as is.', button: { id: 'undo', label: 'Undo' } },
};

const PLACES = {
  footer: '#main footer',
  field: '#main footer [contenteditable="true"]',
  quote: '#main footer [data-testid="quoted-message"]',
  conversation: '#main',
  header: '#main header',
  message: '#main [data-id]',
  chatName: '#main header span',
  store: 'bar',
  bridge: 'bridge',
  style: '.bar { display: flex; }',
  icons: { sparkle: 'M1 1z', close: 'M2 2z', fold: 'M3 3z', unfold: 'M4 4z' },
};

const KIT = {
  align: alignAssistantBar,
  join: joinAssistantBar,
  box: assistantTrayBox,
  raise: raiseAssistantQuote,
  fitTray: fitAssistantTray,
  square: squareAssistantBox,
  squaredBy: assistantBoxSquared,
  layer: assistantQuoteLayer,
  watchPage: listenToAssistantPage,
  paint: paintWhatsAppTheme,
  room: holdAssistantBarRoom,
  build: buildAssistantBar,
  rows: assistantBarRows,
  node: shadowPart,
  show: showAssistantBar,
  wire: wireAssistantBar,
  update: updateAssistantBar,
  notice: noticeAssistantBar,
  icon: strokeIcon,
  here: assistantBarHere,
  fingerprint,
  refresh: refreshAssistantBar,
  hidden: assistantBarHidden,
  mark: markAssistantBar,
  card: assistantSummaryCard,
  summary: summaryAssistantBar,
  sections: assistantSummarySections,
  fit: fitAssistantSummary,
  act: actOnAssistantBar,
  turn: edgeTurn,
  close: closeAssistantSummary,
};

interface Stored {
  host: HTMLElement;
  key: string | null;
  follow: () => void;
  parts: {
    bar: HTMLElement;
    notice: HTMLElement;
    text: HTMLElement;
    action: HTMLButtonElement;
    close: HTMLButtonElement;
    chips: HTMLElement;
    heading: HTMLElement;
    list: HTMLElement;
    status: HTMLElement;
    collapse: HTMLButtonElement;
    folded: HTMLElement;
    expand: HTMLButtonElement;
    foldLabel: HTMLElement;
  };
}

/** WhatsApp's message box, which orders the chat's parts with flexbox `order` and raises itself (#466). */
const FOOTER =
  '<footer style="order: 3; z-index: 2; color: rgb(17, 27, 33)"><div contenteditable="true"></div></footer>';

/** A chat with its message box, the scope the adapter world would be, and the bar's bridge. */
function setup() {
  document.body.innerHTML = `<div id="main"><div role="row">Hi</div>${FOOTER}</div>`;
  const bridge = {
    use: vi.fn(),
    collapse: vi.fn(),
    expand: vi.fn(),
    button: vi.fn(),
    summarize: vi.fn(),
    closeSummary: vi.fn(),
  };
  const scope: Record<string, unknown> = {
    bridge,
    getComputedStyle,
    setTimeout,
    requestAnimationFrame,
  };
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
    expect(shadow.querySelector('.bar')?.getAttribute('aria-label')).toBe('AI Assistant');
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
      ['chips', 'chips'],
      ['heading', 'heading'],
      ['collapse', 'icon'],
      ['list', 'list'],
      ['status', 'status'],
      ['folded', 'row folded'],
      ['expand', 'fold'],
      ['foldLabel', 'fold-label'],
      ['card', 'card'],
      ['cardTitle', 'card-title'],
      ['cardClose', 'icon'],
      ['ready', 'status'],
      ['cardBody', 'card-body'],
      ['covers', 'covers'],
      ['retry', 'action'],
    ]);
    expect(parts.status.getAttribute('role')).toBe('status');
    expect(parts.list.tagName).toBe('UL');
  });

  it('gives buttons their action and button attributes, and nothing else either', () => {
    const t = setup();
    t.render();
    const { parts } = t.stored();
    expect(parts.action.dataset['action']).toBe('button');
    expect(parts.close.dataset).toMatchObject({ action: 'button', id: 'close' });
    expect(parts.collapse.dataset['action']).toBe('collapse');
    expect(parts.expand.dataset['action']).toBe('expand');
    for (const button of [parts.action, parts.close, parts.collapse, parts.expand]) {
      expect(button.getAttribute('type')).toBe('button');
    }
    expect(parts.text.hasAttribute('type')).toBe(false);
    expect(parts.text.dataset['action']).toBeUndefined();
  });

  it('starts each row with the sparkle, a cross to close, and chevrons to fold and unfold in one place', () => {
    const t = setup();
    t.render();
    const { parts } = t.stored();
    const drawn = (svg: Element | null) => [
      svg?.getAttribute('class'),
      svg?.getAttribute('aria-hidden'),
      svg?.querySelector('path')?.getAttribute('d'),
    ];
    expect(drawn(parts.notice.firstElementChild)).toEqual(['mark', 'true', 'M1 1z']);
    expect(drawn(parts.close.querySelector('svg'))).toEqual(['cross', 'true', 'M2 2z']);
    // The suggestions sit under a heading that starts with the sparkle and ends with the fold (#764).
    const head = parts.chips.firstElementChild;
    expect(drawn(head?.firstElementChild ?? null)).toEqual(['mark', 'true', 'M1 1z']);
    expect([...(head?.children ?? [])].slice(1)).toEqual([parts.heading, parts.collapse]);
    expect(parts.heading.textContent).toBe('Suggested replies');
    expect(parts.folded.firstElementChild).toBe(parts.expand);
    expect([...parts.collapse.querySelectorAll('svg')].map(drawn)).toEqual([
      ['chevron', 'true', 'M3 3z'],
    ]);
    const unfold = [...parts.expand.querySelectorAll('svg')];
    expect(unfold.map(drawn)).toEqual([
      ['mark', 'true', 'M1 1z'],
      ['chevron', 'true', 'M4 4z'],
    ]);
    expect(parts.expand.children[1]).toBe(parts.foldLabel);
  });

  it('names the controls that show only an icon', () => {
    const t = setup();
    t.render();
    const { close, collapse, expand, foldLabel } = t.stored().parts;
    expect(collapse.getAttribute('aria-label')).toBe('Hide suggestions');
    expect(collapse.getAttribute('title')).toBe('Hide suggestions');
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    expect(expand.getAttribute('aria-label')).toBe('Show suggestions');
    expect(expand.getAttribute('title')).toBe('Show suggestions');
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    expect(foldLabel.textContent).toBe('Suggestions');
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

  it('keeps the suggestions while the user types, marked so they show a little quieter (#743)', () => {
    const t = setup();
    t.render();
    const { host, parts } = t.stored();
    type('Hello');
    expect(parts.chips.hidden).toBe(false);
    expect(parts.bar.dataset['typed']).toBe('true');
    expect(host.style.display).toBe('');
    type('  ');
    expect(parts.bar.dataset['typed']).toBe('false');
    // A draft already there when the bar renders keeps them too, beside a notice.
    field()?.replaceChildren('Hi');
    t.render({ ...UNDO, suggestions: ['Sure'] });
    expect(parts.chips.hidden).toBe(false);
    expect(parts.notice.hidden).toBe(false);
    expect(parts.bar.dataset['typed']).toBe('true');
  });

  it('shows the suggestions over a message box it cannot find the field of', () => {
    const t = setup();
    field()?.remove();
    t.render();
    expect(t.stored().parts.chips.hidden).toBe(false);
  });

  it('listens to the page’s typing and clicks only once, however often it renders', () => {
    const listen = vi.spyOn(document, 'addEventListener');
    const t = setup();
    t.render();
    t.render(UNDO);
    // Typing, and a key let go, which is all a deletion in WhatsApp's editor gives.
    expect(listen).toHaveBeenCalledTimes(3);
    expect(listen).toHaveBeenCalledWith('input', expect.any(Function), true);
    expect(listen).toHaveBeenCalledWith('keyup', expect.any(Function), true);
    expect(listen).toHaveBeenCalledWith('click', expect.any(Function), true);
  });

  it('follows the page for a second as it goes into a chat that opened, starting the second anew (#764)', () => {
    const frames: ((now: number) => void)[] = [];
    const t = setup();
    t.scope['requestAnimationFrame'] = (callback: (now: number) => void) => frames.push(callback);
    expect(t.render()).toBe('placed');
    expect(frames).toHaveLength(1);
    // Kept in the same chat, it follows nothing new.
    t.render({ ...CONTENT, writing: true });
    expect(frames).toHaveLength(1);
    frames.shift()?.(1000);
    frames.shift()?.(1900);
    // Following again while it follows starts the second anew, with no second loop.
    t.stored().follow();
    expect(frames).toHaveLength(1);
    frames.shift()?.(2500);
    frames.shift()?.(3400);
    expect(frames).toHaveLength(1);
    frames.shift()?.(3500);
    expect(frames).toHaveLength(0);
  });

  it('follows the page before every frame for a second after a click, then stops (#764)', () => {
    const frames: ((now: number) => void)[] = [];
    const t = setup();
    t.scope['requestAnimationFrame'] = (callback: (now: number) => void) => frames.push(callback);
    const show = vi.fn(showAssistantBar);
    renderAssistantBar(document, t.scope, CONTENT, PLACES, { ...KIT, show });
    show.mockClear();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(show).not.toHaveBeenCalled();
    for (const now of [5000, 5016, 5500, 5999]) {
      frames.shift()?.(now);
    }
    expect(show).toHaveBeenCalledTimes(4);
    expect(frames).toHaveLength(1);
    frames.shift()?.(6000);
    expect(show).toHaveBeenCalledTimes(5);
    expect(frames).toHaveLength(0);
    // With no message box left, it only shows what it has.
    footer()?.remove();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    frames.shift()?.(9000);
    expect(show).toHaveBeenCalledTimes(6);
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
    return rows.filter((row) => row.closest('[hidden]') === null).length * 50;
  });
}

describe('joining the tray to the message box (#764)', () => {
  /** Lays `node` out from `left` to `right`, as the browser would. */
  const across = (node: Element | null, left: number, right: number): void => {
    if (node === null) {
      throw new Error('Nothing to lay out.');
    }
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
      left,
      right,
      top: 0,
      bottom: 0,
      width: right - left,
      height: 0,
    } as DOMRect);
  };
  /** WhatsApp's message box, with its fill, inside the footer, and the layer it quotes a message in. */
  const page = (quote = '') => {
    // WhatsApp squares the box's top under a quote of the message the user replies to.
    const corners = quote === '' ? '' : '; border-radius: 0 0 26px 26px';
    document.body.innerHTML = `<div id="main"><footer style="order: 3; z-index: 2; color: rgb(17, 27, 33)"><div><div class="box" style="background-color: rgb(255, 255, 255)${corners}"><span><div contenteditable="true"></div></span></div></div><div class="layer">${quote}</div></footer></div>`;
    across(document.querySelector('#main footer'), 100, 1100);
    across(document.querySelector('.box'), 112, 1088);
  };
  const quoted = '<div><div data-testid="quoted-message">Dinner?</div></div>';

  it('finds the message box as the field’s nearest box with a fill of its own, or none', () => {
    page();
    const footer = document.querySelector('#main footer') as never;
    expect(assistantTrayBox(window as never, footer, PLACES)).toBe(document.querySelector('.box'));
    document.querySelector('.box')?.removeAttribute('style');
    expect(assistantTrayBox(window as never, footer, PLACES)).toBeNull();
    document.querySelector('[contenteditable]')?.remove();
    expect(assistantTrayBox(window as never, footer, PLACES)).toBeNull();
  });

  it('takes the box’s edges, fill and shadow, and squares the box’s top while it sits on it', () => {
    page();
    const box = document.querySelector<HTMLElement>('.box') ?? document.body;
    box.style.setProperty('box-shadow', 'rgba(0, 0, 0, 0.12) 0px 1px 6px 0px');
    const scope: Record<string, unknown> = { getComputedStyle, setTimeout, requestAnimationFrame };
    renderAssistantBar(document, scope, CONTENT, PLACES, KIT);
    const { host, parts } = scope['bar'] as Stored;
    // The tray's edges are the box's, measured from the tray's own frame.
    across(host, 100, 1100);
    renderAssistantBar(document, scope, { ...CONTENT, writing: true }, PLACES, KIT);
    expect(parts.bar.dataset['tray']).toBe('true');
    expect(parts.bar.style.marginInline).toBe('12px 12px');
    expect(host.style.getPropertyValue('--tray')).toBe('rgb(255, 255, 255)');
    expect(host.style.getPropertyValue('--tray-shadow')).toBe(
      'rgba(0, 0, 0, 0.12) 0px 1px 6px 0px',
    );
    // Over the box, whose own shadow it hides where they meet.
    expect(host.style.zIndex).toBe('3');
    expect(parts.bar.dataset['joined']).toBe('box');
    expect([box.style.borderStartStartRadius, box.style.borderStartEndRadius]).toEqual(['0', '0']);
  });

  it('lines up right to left, and gives the box its corners back once the tray goes', () => {
    page();
    const box = document.querySelector<HTMLElement>('.box') ?? document.body;
    const scope: Record<string, unknown> = { getComputedStyle, setTimeout, requestAnimationFrame };
    renderAssistantBar(document, scope, CONTENT, PLACES, KIT);
    const { parts } = scope['bar'] as Stored;
    across((scope['bar'] as Stored).host, 100, 1100);
    // Right to left, the box's start is on its right.
    across(document.querySelector('.box'), 120, 1088);
    document.querySelector<HTMLElement>('#main footer')?.style.setProperty('direction', 'rtl');
    renderAssistantBar(document, scope, CONTENT, PLACES, KIT);
    expect(parts.bar.style.marginInline).toBe('12px 20px');
    // With nothing in the tray, the box gets its own corners back.
    renderAssistantBar(document, scope, { ...CONTENT, suggestions: [] }, PLACES, KIT);
    expect([box.style.borderStartStartRadius, box.style.borderStartEndRadius]).toEqual(['', '']);
  });

  it('draws over a footer of no stacking order of its own', () => {
    page();
    document.querySelector<HTMLElement>('#main footer')?.style.removeProperty('z-index');
    const scope: Record<string, unknown> = { getComputedStyle, setTimeout, requestAnimationFrame };
    renderAssistantBar(document, scope, CONTENT, PLACES, KIT);
    expect((scope['bar'] as Stored).host.style.zIndex).toBe('1');
  });

  it('moves WhatsApp’s quote up over the tray while the user replies, and back once it goes', () => {
    page(quoted);
    const scope: Record<string, unknown> = { getComputedStyle, setTimeout, requestAnimationFrame };
    const layer = document.querySelector<HTMLElement>('.layer') ?? document.body;
    const box = document.querySelector<HTMLElement>('.box') ?? document.body;
    renderAssistantBar(document, scope, CONTENT, PLACES, KIT);
    const { host, parts } = scope['bar'] as Stored;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ height: 100.6 } as DOMRect);
    renderAssistantBar(document, scope, { ...CONTENT, writing: true }, PLACES, KIT);
    expect(parts.bar.dataset['joined']).toBe('quote');
    expect(layer.style.translate).toBe('0 -99.6px');
    // Squared under the tray too, so a quote on its way out never shows the box's rounded top.
    expect(box.style.borderStartStartRadius).toBe('0');
    renderAssistantBar(document, scope, { ...CONTENT, suggestions: [] }, PLACES, KIT);
    expect(layer.style.translate).toBe('');
    // A quote WhatsApp drew anew is moved, and the old layer put back.
    renderAssistantBar(document, scope, CONTENT, PLACES, KIT);
    expect(layer.style.translate).toBe('0 -99.6px');
    layer.remove();
    document
      .querySelector('#main footer')
      ?.insertAdjacentHTML('beforeend', `<div class="layer2">${quoted}</div>`);
    renderAssistantBar(document, scope, { ...CONTENT, writing: true }, PLACES, KIT);
    expect(layer.style.translate).toBe('');
    expect(document.querySelector<HTMLElement>('.layer2')?.style.translate).toBe('0 -99.6px');
  });

  it('joins the box again at once as the user closes the quote, which WhatsApp still takes away', () => {
    page(quoted);
    const box = document.querySelector<HTMLElement>('.box') ?? document.body;
    const scope: Record<string, unknown> = { getComputedStyle, setTimeout, requestAnimationFrame };
    renderAssistantBar(document, scope, CONTENT, PLACES, KIT);
    const { parts } = scope['bar'] as Stored;
    expect(parts.bar.dataset['joined']).toBe('quote');
    // WhatsApp gives the box its rounded top back while the quote is still on its way out.
    box.style.removeProperty('border-radius');
    renderAssistantBar(document, scope, { ...CONTENT, writing: true }, PLACES, KIT);
    expect(parts.bar.dataset['joined']).toBe('box');
    expect(box.style.borderStartStartRadius).toBe('0');
    // Its quote drops back behind the tray, where its way out goes unseen.
    expect(document.querySelector<HTMLElement>('.layer')?.style.translate).toBe('');
    // Telling whose corners are square sets the tray's own aside only for a moment.
    expect(assistantBoxSquared(window as never, box as never, box as never)).toBe(false);
    expect(assistantBoxSquared(window as never, null, box as never)).toBe(false);
    expect(box.style.borderStartStartRadius).toBe('0');
  });

  it('gives a box it squared its corners back once it sits on another', () => {
    const [first, second] = [document.createElement('div'), document.createElement('div')];
    const store: { squared: HTMLElement | undefined } = { squared: undefined };
    squareAssistantBox(store as never, first as never);
    squareAssistantBox(store as never, second as never);
    expect([first.style.borderStartStartRadius, second.style.borderStartStartRadius]).toEqual([
      '',
      '0',
    ]);
    expect(store.squared).toBe(second);
  });

  it('puts back a layer it moved, and moves none while nothing is raised', () => {
    const moved = document.createElement('div');
    moved.style.translate = '0 -40px';
    const store: { raised: HTMLElement | undefined } = { raised: moved };
    raiseAssistantQuote(store as never, undefined, 0);
    expect(moved.style.translate).toBe('');
    expect(store.raised).toBeUndefined();
  });
});

describe('holdAssistantBarRoom', () => {
  type Bar = Parameters<typeof holdAssistantBarRoom>[2];
  /** A bar `height` tall, which the list's layout reads. */
  function bar(height: number, top = 10_000) {
    const node = {
      offsetHeight: height,
      ownerDocument: document,
      getBoundingClientRect: () => ({ top, bottom: top + height }),
    } as unknown as Bar;
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

  it('keeps a chat WhatsApp drew anew at its end as the bar comes back into it (#743)', () => {
    barHeights();
    const t = setup();
    const list = scrollingChat(
      () => (t.scope['bar'] as Stored | undefined)?.parts.bar.offsetHeight ?? 0,
    );
    list.scrollTop = 1000;
    t.render();
    expect(fromEnd(list)).toBe(0);
    // WhatsApp draws the chat again, without the bar, and opens it at its end.
    t.stored().host.remove();
    list.scrollTop = 1000;
    expect(fromEnd(list)).toBe(0);
    // The same suggestions come back: the list gets shorter, and stays at its end.
    expect(t.render()).toBe('placed');
    expect(fromEnd(list)).toBe(0);
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
    // Typing changes nothing that shows, as the suggestions stay (#743), so nothing is measured or scrolled.
    measured.mockClear();
    type('Hi');
    type('Hi there');
    type('');
    expect(measured).not.toHaveBeenCalled();
    expect([list.scrollTop, fromEnd(list)]).toEqual([500, 0]);
    // Folding them away leaves a row as high, the one they fold into.
    t.render({ ...CONTENT, notice: { text: 'Try again.', button: null }, collapsed: true });
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
    t.stored().parts.collapse.click();
    expect(t.bridge.use).not.toHaveBeenCalled();
    expect(t.bridge.collapse).not.toHaveBeenCalled();
    if (second !== undefined) {
      click(second);
    }
    expect(t.bridge.use).toHaveBeenCalledExactlyOnceWith(1);
    click(t.stored().parts.collapse);
    expect(t.bridge.collapse).toHaveBeenCalledOnce();
    expect(t.bridge.collapse.mock.calls[0]).toEqual([]);
    click(t.stored().parts.expand);
    expect(t.bridge.expand).toHaveBeenCalledExactlyOnceWith();
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
    expect(t.bridge.collapse).not.toHaveBeenCalled();
    click(t.stored().parts.folded);
    expect(t.bridge.expand).not.toHaveBeenCalled();
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
      /\{ align: [\s\S]+, join: [\s\S]+, box: [\s\S]+, raise: [\s\S]+, paint: [\s\S]+, room: [\s\S]+, build: [\s\S]+, rows: [\s\S]+, node: [\s\S]+, show: [\s\S]+, wire: [\s\S]+, update: [\s\S]+, notice: [\s\S]+, icon: [\s\S]+ \}\)$/,
    );
    expect(code).toContain('"store":"yapyapAssistantBarView"');
    expect(code).toContain('"bridge":"yapyapAssistantBar"');
    expect(code).toContain(`"field":${JSON.stringify(LANDMARKS.composer)}`);
    expect(code).toContain(`"quote":${JSON.stringify(LANDMARKS.composerQuote)}`);
    expect(code).toContain(`"conversation":${JSON.stringify(LANDMARKS.conversation)}`);
    expect(code).toContain(`"message":${JSON.stringify(LANDMARKS.message)}`);
    expect(code).toContain(`"sparkle":${JSON.stringify(ASSISTANT_ICONS.sparkle)}`);
    expect(code).toContain(`"close":${JSON.stringify(ASSISTANT_ICONS.close)}`);
    // The assistant's own accent, in both of WhatsApp's themes, then the bar's styles.
    expect(code).toContain('--ai: #3f2fb8');
    expect(code).toContain(":host([data-theme='dark'])");
    expect(code).toContain(".bar[data-tray='true']");
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
      const world: Record<string, unknown> = { document, getComputedStyle, requestAnimationFrame };
      expect(runInNewContext(code, world)).toBe('placed');
      expect(footer()?.previousElementSibling?.tagName).toBe('DIV');
      expect(Object.keys(world)).toEqual([
        'document',
        'getComputedStyle',
        'requestAnimationFrame',
        'yapyapAssistantBarView',
      ]);
    },
  );
});

describe('assistantBarHere', () => {
  it('shows another chat’s suggestions and notice nowhere, by the fingerprint of the open chat’s header (#730, #741)', () => {
    document.body.innerHTML =
      '<div id="main"><header><span> Ana Maria Lopes </span></header></div>';
    // The look names the chat by its header's textContent as it is, spaces and all.
    const mine = { ...UNDO, suggestions: ['Hi'], chat: fingerprint(' Ana Maria Lopes ') };
    expect(assistantBarHere(document, mine, PLACES, fingerprint)).toBe(mine);
    const other = { ...mine, chat: fingerprint('Rui') };
    expect(assistantBarHere(document, other, PLACES, fingerprint)).toStrictEqual({
      ...other,
      suggestions: [],
      notice: null,
    });
    // While no chat is followed, they show.
    expect(assistantBarHere(document, CONTENT, PLACES, fingerprint)).toBe(CONTENT);
  });

  it('reads a header with no text as empty, and hides them where no chat is open', () => {
    const mine = { ...CONTENT, chat: fingerprint('') };
    const empty = { querySelector: () => ({ textContent: null }) };
    expect(assistantBarHere(empty as unknown as Document, mine, PLACES, fingerprint)).toBe(mine);
    const none = { querySelector: () => null };
    expect(
      assistantBarHere(none as unknown as Document, mine, PLACES, fingerprint).suggestions,
    ).toEqual([]);
  });

  it('takes another chat’s suggestions away as the bar renders into the new chat', () => {
    const t = setup();
    document
      .querySelector('#main')
      ?.prepend(Object.assign(document.createElement('header'), { innerHTML: '<span>Rui</span>' }));
    t.render({ ...CONTENT, chat: fingerprint('Rui') });
    expect(t.stored().parts.list.childElementCount).toBe(2);
    document.querySelector('#main header span')?.replaceChildren('Ana');
    t.render({ ...CONTENT, chat: fingerprint('Rui') });
    expect(t.stored().parts.list.childElementCount).toBe(0);
  });
});

describe('the suggestions folded away, and while they are written', () => {
  const shown = (t: ReturnType<typeof setup>) => {
    const { chips, folded } = t.stored().parts;
    return { chips: !chips.hidden, folded: !folded.hidden };
  };

  it('folds the suggestions into one chip that shows them again, only when there are some (#729)', () => {
    const t = setup();
    t.render({ ...CONTENT, collapsed: true });
    expect(shown(t)).toEqual({ chips: false, folded: true });
    expect(t.stored().parts.bar.dataset['collapsed']).toBe('true');
    t.render({ ...CONTENT, collapsed: true, suggestions: [] });
    expect(shown(t)).toEqual({ chips: false, folded: false });
    t.render({ ...CONTENT, collapsed: true, suggestions: [], writing: true });
    expect(shown(t)).toEqual({ chips: false, folded: false });
    t.render(CONTENT);
    expect(shown(t)).toEqual({ chips: true, folded: false });
  });

  it('shows one chip saying they are being written, and tells screen readers once (#743)', () => {
    const t = setup();
    t.render({ ...CONTENT, suggestions: [], writing: true });
    const { list, status } = t.stored().parts;
    expect(shown(t)).toEqual({ chips: true, folded: false });
    expect([...list.children].map((item) => item.getAttribute('class'))).toEqual([
      'placeholder working',
    ]);
    expect(list.firstElementChild?.textContent).toBe('Writing suggestions…');
    expect(list.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(list.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('Writing suggestions…');
    expect(t.chips()).toEqual([]);
    // Suggestions already there show instead, and the status goes quiet.
    t.render({ ...CONTENT, writing: true });
    expect(t.chips()).toHaveLength(2);
    expect(list.getAttribute('aria-busy')).toBe('false');
    expect(status.textContent).toBe('');
  });

  it('keeps the folded chip while the user types', () => {
    const t = setup();
    t.render({ ...CONTENT, collapsed: true });
    const field = document.querySelector<HTMLElement>('[contenteditable="true"]');
    if (field !== null) {
      field.textContent = 'Hi';
    }
    document.dispatchEvent(new Event('input'));
    expect(shown(t)).toEqual({ chips: false, folded: true });
  });

  it('reads what a bar before any render holds as nothing', () => {
    const parts = {
      list: { dataset: {} },
      bar: { dataset: {} },
      notice: { hidden: true },
    } as unknown as Parameters<typeof assistantBarHidden>[0];
    expect(assistantBarHidden(parts)).toEqual({
      chips: true,
      folded: true,
      card: true,
      tray: true,
      bar: true,
    });
  });
});

/** The summary as the main process words it, being written, shown or failed (#705). */
const SUMMARY = {
  stage: 'shown',
  title: 'Summary of 3 unread messages',
  ready: 'The summary of 3 unread messages is ready.',
  points: ['Ben asks you to <b>drive</b>.', 'Ana sent a photo.', 'Cy is late.'],
  covers: 'Covers the newest 2, as your history limit allows.',
  problem: '',
  retry: '',
} as const;

const summarized = (
  stage: 'working' | 'shown' | 'failed',
  more: Partial<BarContent> = {},
  summary: Partial<typeof SUMMARY> | Record<string, unknown> = {},
) => ({
  ...CONTENT,
  summary: { ...SUMMARY, stage, ...summary },
  ...more,
});

describe('the summary of unread messages (#705)', () => {
  const rows = (t: ReturnType<typeof setup>) => {
    const { chips, folded, card } = t.stored().parts as unknown as Record<string, HTMLElement>;
    return { chips: !chips?.hidden, folded: !folded?.hidden, card: !card?.hidden };
  };
  const card = (t: ReturnType<typeof setup>) =>
    (t.stored().parts as unknown as { card: HTMLElement }).card;
  const line = (t: ReturnType<typeof setup>) => card(t).querySelector('.card-line')?.textContent;
  const retry = (t: ReturnType<typeof setup>) =>
    card(t).querySelector<HTMLButtonElement>('[data-action="summarize"]');

  it('says in its box that it is being written, with the light round its edge, beside the suggestions', () => {
    const t = setup();
    t.render(summarized('working'));
    expect(rows(t)).toEqual({ chips: true, folded: false, card: true });
    expect(card(t).getAttribute('class')).toBe('card working');
    expect(card(t).getAttribute('aria-busy')).toBe('true');
    expect(line(t)).toBe('Writing the summary…');
    expect(retry(t)?.hidden).toBe(true);
    // The suggestions' row says nothing of it.
    expect(t.stored().parts.list.dataset['items']).toBe(String(CONTENT.suggestions.length));
    expect(t.stored().parts.status.textContent).toBe('');
    // Alone, it still shows the bar.
    t.render(summarized('working', { suggestions: [] }));
    expect(rows(t)).toEqual({ chips: false, folded: false, card: true });
    expect(t.stored().host.style.display).toBe('');
  });

  it('shows it in a box named by its heading, as text, never taking the focus', () => {
    const t = setup();
    field()?.focus();
    t.render(summarized('shown'));
    const region = card(t);
    expect(region.getAttribute('class')).toBe('card');
    expect(region.getAttribute('aria-busy')).toBe('false');
    expect(region.getAttribute('role')).toBe('region');
    expect(region.hasAttribute('tabindex')).toBe(false);
    expect(document.activeElement).toBe(field());
    const title = t.shadow().querySelector(`#${String(region.getAttribute('aria-labelledby'))}`);
    expect(title?.textContent).toBe('Summary of 3 unread messages');
    expect(title?.tagName).toBe('H2');
    expect(region.querySelector('[role="status"]')?.textContent).toBe(SUMMARY.ready);
    expect(region.querySelectorAll('h3')).toHaveLength(0);
    const items = [...region.querySelectorAll('.card-body li')];
    expect(items.map((item) => item.textContent)).toEqual([
      'Ben asks you to <b>drive</b>.',
      'Ana sent a photo.',
      'Cy is late.',
    ]);
    expect(region.querySelector('b')).toBeNull();
    const covers = region.querySelector<HTMLElement>('.covers');
    expect([covers?.hidden, covers?.textContent]).toEqual([false, SUMMARY.covers]);
  });

  it('offers only its close, and says nothing of how much it covers when it covers all, nor once gone', () => {
    const t = setup();
    t.render(summarized('shown'));
    const region = card(t);
    expect(retry(t)?.hidden).toBe(true);
    const close = region.querySelector('[data-action="closeSummary"]');
    expect(close?.getAttribute('aria-label')).toBe('Close Summary');
    t.render(summarized('shown', {}, { covers: '' }));
    expect(region.querySelector<HTMLElement>('.covers')?.hidden).toBe(true);
    t.render(CONTENT);
    expect(rows(t)).toEqual({ chips: true, folded: false, card: false });
    expect(region.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('says why none came, and writes it again on Try Again only when that may help', () => {
    const t = setup();
    const problem = 'Claude (Anthropic) could not be reached.';
    t.render(summarized('failed', {}, { problem, retry: 'Try Again' }));
    expect(line(t)).toBe(problem);
    expect(card(t).querySelector<HTMLElement>('.covers')?.hidden).toBe(true);
    expect([retry(t)?.hidden, retry(t)?.textContent]).toEqual([false, 'Try Again']);
    const button = retry(t);
    if (button !== null) {
      click(button);
    }
    expect(t.bridge.summarize).toHaveBeenCalledExactlyOnceWith();
    t.render(summarized('failed', {}, { problem: 'The model declined to summarize this chat.' }));
    expect(retry(t)?.hidden).toBe(true);
    expect(card(t).querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('hangs the box below the chat’s header, at most half as high as the room down to the bar', () => {
    const t = setup();
    const header = document.createElement('header');
    document.querySelector('#main')?.prepend(header);
    const at = (node: Element, top: number, bottom: number, width = 0) => {
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom,
        width,
        height: bottom - top,
      } as DOMRect);
    };
    at(header, 0, 60);
    t.render(CONTENT);
    expect(card(t).style.insetBlockStart).toBe('');
    at(t.stored().parts.bar, 700, 760);
    at(card(t), 0, 96, 360);
    t.render(summarized('shown'));
    expect(card(t).style.insetBlockStart).toBe('-628px');
    expect(card(t).style.maxBlockSize).toBe('314px');
    expect(card(t).style.getPropertyValue('--edge-turn')).toBe(edgeTurn(360, 96));
    // Never higher than 420px, nor lower than 96px.
    at(t.stored().parts.bar, 1400, 1460);
    t.render(summarized('shown', { writing: true }));
    expect(card(t).style.maxBlockSize).toBe('420px');
    at(t.stored().parts.bar, 100, 160);
    t.render(summarized('shown', { collapsed: true }));
    expect(card(t).style.maxBlockSize).toBe('96px');
    // Without a header, it is left where it was.
    header.remove();
    t.render(summarized('working'));
    expect(card(t).style.maxBlockSize).toBe('96px');
  });

  it('closes on Close or Escape in the box, and gives the message box the focus back', () => {
    const t = setup();
    t.render(summarized('shown'));
    const close = card(t).querySelector<HTMLElement>('[data-action="closeSummary"]');
    if (close !== null) {
      click(close);
    }
    expect(t.bridge.closeSummary).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(field());
    const escape = (target: Element, key = 'Escape') => {
      target.dispatchEvent(trusted(new KeyboardEvent('keydown', { key, bubbles: true })));
    };
    escape(card(t));
    expect(t.bridge.closeSummary).toHaveBeenCalledTimes(2);
    // Not another key, nor Escape outside the box, nor one a page script made up.
    escape(card(t), 'Enter');
    escape(t.stored().parts.bar);
    card(t).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.bridge.closeSummary).toHaveBeenCalledTimes(2);
    // Without a bridge or a message box, it still closes what it can.
    delete t.scope['bridge'];
    field()?.remove();
    expect(() => {
      escape(card(t));
    }).not.toThrow();
  });

  it('shows another chat’s summary nowhere', () => {
    const t = setup();
    document
      .querySelector('#main')
      ?.prepend(Object.assign(document.createElement('header'), { innerHTML: '<span>Ana</span>' }));
    t.render(summarized('shown', { chat: fingerprint('Rui') }));
    expect(card(t).hidden).toBe(true);
  });
});
