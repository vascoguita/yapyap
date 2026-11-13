/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_ICONS } from './assistant-look.ts';
import {
  buildComposerTool,
  composerToolIcon,
  composerToolItem,
  composerToolKeys,
  composerToolNode,
  composerToolRender,
  findComposerSlot,
  paintComposerTool,
  placeComposerMenu,
  renderComposerTool,
  showComposerTool,
  updateComposerTool,
  wireComposerTool,
  type ToolContent,
} from './composer-tool.ts';
import { LANDMARKS } from './page-state.ts';

const option = (value: string, label: string) => ({ value, label, hint: `${label} it.` });

const CONTENT: ToolContent = {
  visible: true,
  working: false,
  current: 'polish',
  options: [option('polish', 'Polish'), option('soften', 'Soften'), option('odd', 'Odd')],
  labels: {
    label: 'Rewrite with AI',
    more: 'Choose how to rewrite',
    settings: 'Assistant settings',
    model: 'Model: Claude Sonnet 5.5',
  },
};

const PLACES = {
  field: '#main footer [contenteditable="true"]',
  footer: '#main footer',
  header: '#main header',
  store: 'tool',
  bridge: 'bridge',
  style: '.tool { display: flex; }',
  icons: {
    modes: { polish: 'M4 4z', soften: 'M5 5z' },
    sparkle: 'M1 1z',
    caret: 'M2 2z',
    check: 'M3 3z',
    settings: 'M6 6z',
  },
};

const KIT = {
  slot: findComposerSlot,
  paint: paintComposerTool,
  build: buildComposerTool,
  node: composerToolNode,
  show: showComposerTool,
  wire: wireComposerTool,
  place: placeComposerMenu,
  keys: composerToolKeys,
  update: updateComposerTool,
  item: composerToolItem,
  icon: composerToolIcon,
};

/** WhatsApp's message box as it lays it out: attach, the field in its own box, then the microphone. */
const ROW =
  '<div class="row" style="color: rgb(17, 27, 33)">' +
  '<div><button>+</button></div><div class="box"><div contenteditable="true">Hi</div></div>' +
  '<div class="mic"><button>Voice</button></div></div>';

interface Kept {
  host: HTMLElement;
  key: string | null;
  current: string;
  parts: {
    tool: HTMLElement;
    apply: HTMLButtonElement;
    more: HTMLButtonElement;
    menu: HTMLElement;
  };
}

/** An open chat with a draft, the scope the adapter world would be, and the assistant's bridge. */
function setup(row = ROW) {
  document.body.innerHTML = `<div id="main"><footer>${row}</footer></div>`;
  const bridge = { polish: vi.fn(), settings: vi.fn() };
  const scope: Record<string, unknown> = { bridge, getComputedStyle };
  const render = (content: ToolContent = CONTENT) =>
    renderComposerTool(document, scope, content, PLACES, KIT);
  const kept = (): Kept => scope['tool'] as Kept;
  // The test reaches into the closed shadow root through the parts the adapter keeps.
  const shadow = (): ShadowRoot => kept().parts.tool.getRootNode() as ShadowRoot;
  const items = (): HTMLButtonElement[] => [
    ...kept().parts.menu.querySelectorAll<HTMLButtonElement>('.item'),
  ];
  const focused = (): Element | null => shadow().activeElement;
  return { bridge, scope, render, kept, shadow, items, focused };
}

/** An event as the user's own input makes it; page scripts can only make untrusted ones. */
function trusted<T extends Event>(event: T): T {
  Object.defineProperty(event, 'isTrusted', { value: true });
  return event;
}

const click = (target: Element): void => {
  target.dispatchEvent(trusted(new MouseEvent('click', { bubbles: true })));
};

const press = (target: Element | null | undefined, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target?.dispatchEvent(event);
  return event;
};

const mic = (): Element | null => document.querySelector('.mic');
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

describe('renderComposerTool', () => {
  it('puts the button right before the microphone, in a closed shadow root', () => {
    const t = setup();
    expect(t.render()).toBe('placed');
    const { host, parts } = t.kept();
    expect(mic()?.previousElementSibling).toBe(host);
    expect(host.shadowRoot).toBeNull();
    expect(t.render()).toBe('kept');
    expect(t.shadow().querySelector('style')?.textContent).toBe('.tool { display: flex; }');
    expect(parts.tool.getAttribute('role')).toBe('group');
    expect(parts.tool.getAttribute('aria-label')).toBe('Rewrite with AI');
    expect(parts.apply.getAttribute('title')).toBe('Polish: Polish it.');
    expect(parts.more.getAttribute('aria-label')).toBe('Choose how to rewrite');
    expect(parts.more.getAttribute('title')).toBe('Choose how to rewrite');
    expect(parts.more.getAttribute('aria-haspopup')).toBe('menu');
    expect(parts.more.getAttribute('aria-expanded')).toBe('false');
    expect(parts.menu.getAttribute('role')).toBe('menu');
    expect(parts.menu.hidden).toBe(true);
  });

  it('gives every part the class its styles use, and button attributes to buttons only', () => {
    const t = setup();
    t.render();
    const { tool, apply, more, menu } = t.kept().parts;
    expect(tool.getAttribute('class')).toBe('tool');
    expect(apply.getAttribute('class')).toBe('apply');
    expect(more.getAttribute('class')).toBe('more');
    expect(menu.getAttribute('class')).toBe('menu');
    expect(apply.getAttribute('type')).toBe('button');
    expect(more.getAttribute('type')).toBe('button');
    expect(apply.dataset['action']).toBe('apply');
    expect(more.dataset['action']).toBe('more');
    expect(menu.hasAttribute('type')).toBe(false);
    expect(menu.dataset['action']).toBeUndefined();
    expect(more.querySelector('path')?.getAttribute('d')).toBe('M2 2z');
  });

  it('shows the selected way’s icon and name on the button, as text', () => {
    const t = setup();
    t.render({ ...CONTENT, current: 'soften', options: [option('soften', '<b>Soften</b>')] });
    const { apply } = t.kept().parts;
    expect(apply.querySelector('.label')?.textContent).toBe('<b>Soften</b>');
    expect(apply.querySelector('b')).toBeNull();
    const icon = apply.querySelector('svg');
    expect(icon?.getAttribute('class')).toBe('mode');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('M5 5z');
    t.render({ ...CONTENT, current: 'odd' });
    expect(apply.querySelector('svg path')?.getAttribute('d')).toBe('M1 1z');
    expect(t.kept().current).toBe('odd');
  });

  it('names the assistant and does nothing with no way selected', () => {
    const t = setup();
    t.render({ ...CONTENT, current: 'gone' });
    const { apply } = t.kept().parts;
    expect(apply.querySelector('.label')?.textContent).toBe('Rewrite with AI');
    expect(apply.getAttribute('title')).toBe('Rewrite with AI: Rewrite with AI');
    expect(apply.disabled).toBe(true);
    expect(apply.querySelector('svg path')?.getAttribute('d')).toBe('M1 1z');
    expect(t.kept().current).toBe('');
  });

  it('lists every way and what it does, then the settings with the model in use', () => {
    const t = setup();
    t.render();
    const text = (item: Element, part: string) => item.querySelector(part)?.textContent;
    expect(t.items().map((item) => [text(item, '.name'), text(item, '.hint')])).toEqual([
      ['Polish', 'Polish it.'],
      ['Soften', 'Soften it.'],
      ['Odd', 'Odd it.'],
      ['Assistant settings', 'Model: Claude Sonnet 5.5'],
    ]);
  });

  it('makes each way a radio item that names itself and checks the selected one', () => {
    const t = setup();
    t.render();
    const [polish, soften] = t.items();
    expect(polish?.getAttribute('class')).toBe('item');
    expect(polish?.getAttribute('role')).toBe('menuitemradio');
    expect(polish?.getAttribute('aria-checked')).toBe('true');
    expect(polish?.getAttribute('type')).toBe('button');
    expect(polish?.getAttribute('tabindex')).toBe('-1');
    expect(polish?.dataset).toMatchObject({ action: 'pick', value: 'polish' });
    expect(soften?.getAttribute('aria-checked')).toBe('false');
  });

  /** Each icon in an item, as its class and path. */
  const icons = (item: Element | undefined) =>
    [...(item?.querySelectorAll('svg') ?? [])].map((svg) => [
      svg.getAttribute('class'),
      svg.querySelector('path')?.getAttribute('d'),
    ]);

  it('draws each way’s icon and a check, and the cog for the settings after a line', () => {
    const t = setup();
    t.render();
    const items = t.items();
    const [, soften, odd, settings] = items;
    expect(icons(soften)).toEqual([
      ['mode', 'M5 5z'],
      ['check', 'M3 3z'],
    ]);
    // A way without an icon of its own gets the sparkle.
    expect(icons(odd)[0]).toEqual(['mode', 'M1 1z']);
    expect(icons(settings)[0]).toEqual(['mode', 'M6 6z']);
    const line = t.kept().parts.menu.querySelector('.line');
    expect(line?.getAttribute('role')).toBe('separator');
    expect(line?.previousElementSibling).toBe(odd);
    expect(line?.nextElementSibling).toBe(settings);
  });

  it('makes the settings a plain item, apart from the ways', () => {
    const t = setup();
    t.render();
    const settings = t.items()[3];
    expect(settings?.getAttribute('class')).toBe('item settings');
    expect(settings?.getAttribute('role')).toBe('menuitem');
    expect(settings?.hasAttribute('aria-checked')).toBe(false);
    expect(settings?.dataset['action']).toBe('settings');
    expect(settings?.dataset['value']).toBeUndefined();
  });

  it('writes the ways as text, never as markup', () => {
    const t = setup();
    t.render({ ...CONTENT, options: [{ value: 'polish', label: '<i>P</i>', hint: '<u>h</u>' }] });
    expect(t.shadow().querySelector('i, u')).toBeNull();
    expect(t.items()[0]?.querySelector('.name')?.textContent).toBe('<i>P</i>');
  });

  it('follows WhatsApp’s theme from the message box’s text, render after render', () => {
    const t = setup();
    t.render();
    expect(t.kept().host.dataset['theme']).toBe('light');
    document.querySelector('.row')?.setAttribute('style', 'color: rgb(233, 237, 239)');
    t.render();
    expect(t.kept().host.dataset['theme']).toBe('dark');
  });

  it('changes nothing when nothing changed, and shows the work and the selected way', () => {
    const t = setup();
    t.render();
    const { apply, more, tool } = t.kept().parts;
    const first = t.items()[0];
    t.render();
    expect(t.items()[0]).toBe(first);
    expect(t.kept().key).toBe(JSON.stringify(CONTENT));
    expect(tool.getAttribute('aria-busy')).toBe('false');
    expect(apply.disabled).toBe(false);
    expect(more.disabled).toBe(false);
    t.render({ ...CONTENT, working: true });
    expect(tool.getAttribute('aria-busy')).toBe('true');
    expect(apply.disabled).toBe(true);
    expect(more.disabled).toBe(true);
    t.render({ ...CONTENT, current: 'soften' });
    expect(t.items()[1]?.getAttribute('aria-checked')).toBe('true');
    expect(t.items()[0]?.getAttribute('aria-checked')).toBe('false');
  });

  it('shows only while the message box holds a draft, as the user types', () => {
    const t = setup();
    t.render();
    const { host } = t.kept();
    expect(host.style.display).toBe('');
    type('   ');
    expect(host.style.display).toBe('none');
    type('Hello');
    expect(host.style.display).toBe('');
    // A box emptied without typing, as when the message is sent, hides it at the next render.
    const box = field();
    if (box !== null) {
      box.textContent = '';
    }
    t.render();
    expect(host.style.display).toBe('none');
  });

  it('hides once the message box is gone, as when the chat closes', () => {
    const t = setup();
    t.render();
    field()?.remove();
    document.dispatchEvent(new InputEvent('input'));
    expect(t.kept().host.style.display).toBe('none');
  });

  it('listens to the page’s typing only once, however often it renders', () => {
    const listen = vi.spyOn(document, 'addEventListener');
    const t = setup();
    t.render();
    t.render({ ...CONTENT, working: true });
    expect(listen).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith('input', expect.any(Function), true);
  });

  it('puts the same button back when WhatsApp redraws the message box', () => {
    const t = setup();
    t.render();
    const { host } = t.kept();
    const footer = document.querySelector('footer');
    if (footer !== null) {
      footer.innerHTML = ROW;
    }
    expect(host.isConnected).toBe(false);
    expect(t.render()).toBe('placed');
    expect(t.kept().host).toBe(host);
    expect(mic()?.previousElementSibling).toBe(host);
  });

  it('takes the button away when it is hidden or no chat is open, and reports it', () => {
    const t = setup();
    expect(t.render({ ...CONTENT, visible: false })).toBe('away');
    expect(t.scope['tool']).toBeUndefined();
    t.render();
    expect(t.render({ ...CONTENT, visible: false })).toBe('away');
    expect(t.kept().host.isConnected).toBe(false);
    t.render();
    document.querySelector('footer')?.remove();
    expect(t.render()).toBe('away');
    expect(t.kept().host.isConnected).toBe(false);
  });

  it('stays away from a message box laid out in another way', () => {
    // The field's box is the row's last part, so there is no microphone to go before.
    const t = setup(
      '<div class="row"><div class="box"><div contenteditable="true"></div></div></div>',
    );
    expect(t.render()).toBe('away');
    // A field outside the message box's row.
    document.body.innerHTML = '<div><div><div contenteditable="true"></div></div><p></p></div>';
    expect(t.render()).toBe('away');
    document.body.innerHTML = '<div contenteditable="true"></div>';
    expect(findComposerSlot(document, { ...PLACES, field: '[contenteditable]' })).toBeNull();
    document.body.innerHTML = '';
    expect(t.render()).toBe('away');
  });
});

describe('paintComposerTool', () => {
  it('reads a dark theme from light text, and a light one from dark text or a color it cannot read', () => {
    const host = document.createElement('div');
    const paint = (color: string) => {
      paintComposerTool({ getComputedStyle: () => ({ color }) }, host as never, host as never);
      return host.dataset['theme'];
    };
    expect(paint('rgb(233, 237, 239)')).toBe('dark');
    expect(paint('rgba(250, 250, 250, 0.5)')).toBe('dark');
    expect(paint('rgb(17, 27, 33)')).toBe('light');
    expect(paint('rgb(128, 128, 128)')).toBe('light');
    expect(paint('rgb(129, 129, 129)')).toBe('dark');
    expect(paint('rgb(0, 220, 0)')).toBe('dark');
    expect(paint('rgb(255, 0, 0)')).toBe('light');
    expect(paint('rgb(100, 100, 255)')).toBe('light');
    expect(paint('rgb(120, 140, 255)')).toBe('dark');
    expect(paint('rgb(255, 140, 40)')).toBe('dark');
    expect(paint('')).toBe('light');
    expect(paint('rgb(250)')).toBe('light');
    expect(paint('rgb(250, 250)')).toBe('dark');
  });
});

describe('the button’s controls', () => {
  it('rewrite in the selected way on the user’s click, never on a click a page script made up', () => {
    const t = setup();
    t.render({ ...CONTENT, current: 'soften' });
    const { apply } = t.kept().parts;
    apply.click();
    expect(t.bridge.polish).not.toHaveBeenCalled();
    click(apply);
    expect(t.bridge.polish).toHaveBeenCalledExactlyOnceWith('soften');
    // A click on the button's edge, beside its parts, does nothing.
    click(t.kept().parts.tool);
    expect(t.bridge.polish).toHaveBeenCalledOnce();
  });

  it('open the menu upwards on the arrow, focusing the selected way, and rewrite in the one picked', () => {
    const t = setup();
    t.render({ ...CONTENT, current: 'soften' });
    const { more, menu } = t.kept().parts;
    click(more);
    expect(menu.hidden).toBe(false);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(t.focused()).toBe(t.items()[1]);
    const odd = t.items()[2];
    if (odd !== undefined) {
      click(odd);
    }
    expect(t.bridge.polish).toHaveBeenCalledExactlyOnceWith('odd');
    expect(menu.hidden).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    click(more);
    click(more);
    expect(menu.hidden).toBe(true);
  });

  it('focus the first item when no way is selected', () => {
    const t = setup();
    t.render({ ...CONTENT, current: 'gone' });
    click(t.kept().parts.more);
    expect(t.focused()).toBe(t.items()[0]);
  });

  it('open the assistant’s settings from the menu, and rewrite nothing', () => {
    const t = setup();
    t.render();
    click(t.kept().parts.more);
    const settings = t.items()[3];
    if (settings !== undefined) {
      click(settings);
    }
    expect(t.bridge.settings).toHaveBeenCalledOnce();
    expect(t.bridge.polish).not.toHaveBeenCalled();
    expect(t.kept().parts.menu.hidden).toBe(true);
  });

  it('move through the menu with the arrows, wrapping, and with Home and End', () => {
    const t = setup();
    t.render();
    click(t.kept().parts.more);
    const items = t.items();
    expect(t.focused()).toBe(items[0]);
    const down = press(t.focused(), 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(t.focused()).toBe(items[1]);
    press(t.focused(), 'ArrowDown');
    press(t.focused(), 'ArrowDown');
    expect(t.focused()).toBe(items[3]);
    press(t.focused(), 'ArrowDown');
    expect(t.focused()).toBe(items[0]);
    press(t.focused(), 'ArrowUp');
    expect(t.focused()).toBe(items[3]);
    press(t.focused(), 'ArrowUp');
    expect(t.focused()).toBe(items[2]);
    press(t.focused(), 'Home');
    expect(t.focused()).toBe(items[0]);
    press(t.focused(), 'End');
    expect(t.focused()).toBe(items[3]);
    // Other keys, such as letters, move nothing and are left to the browser.
    const other = press(t.focused(), 'a');
    expect(other.defaultPrevented).toBe(false);
    expect(t.focused()).toBe(items[3]);
  });

  it('close the menu on Escape, back on the arrow, and on Tab, which moves the focus on', () => {
    const t = setup();
    t.render();
    const { more, menu } = t.kept().parts;
    click(more);
    const escape = press(t.focused(), 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(t.focused()).toBe(more);
    click(more);
    const tab = press(t.focused(), 'Tab');
    expect(tab.defaultPrevented).toBe(false);
    expect(menu.hidden).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('leave keys alone while the menu is closed', () => {
    const t = setup();
    t.render();
    const { more, menu } = t.kept().parts;
    more.focus();
    for (const key of ['Escape', 'ArrowDown', 'End']) {
      expect(press(more, key).defaultPrevented).toBe(false);
    }
    expect(menu.hidden).toBe(true);
    expect(t.focused()).toBe(more);
  });

  it('close the menu once the focus leaves it, but not while it moves inside', () => {
    const t = setup();
    t.render();
    const { more, menu, tool } = t.kept().parts;
    click(more);
    const leave = (relatedTarget: EventTarget | null) => {
      t.items()[0]?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
    };
    leave(t.items()[1] ?? null);
    expect(menu.hidden).toBe(false);
    leave(document.body);
    expect(menu.hidden).toBe(true);
    expect(tool.contains(document.body)).toBe(false);
  });

  it('keep the focus in the message box, and keys from WhatsApp’s shortcuts', () => {
    const t = setup();
    t.render();
    const { tool, apply } = t.kept().parts;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    apply.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const heard = vi.fn();
    document.addEventListener('keydown', heard);
    press(apply, 'Enter');
    press(tool, 'k');
    expect(heard).not.toHaveBeenCalled();
    document.removeEventListener('keydown', heard);
  });

  it('do nothing while the preload has not given the assistant its bridge', () => {
    const t = setup();
    delete t.scope['bridge'];
    t.render();
    expect(() => {
      click(t.kept().parts.apply);
      click(t.kept().parts.more);
      const settings = t.items()[3];
      if (settings !== undefined) {
        click(settings);
      }
    }).not.toThrow();
  });
});

describe('placeComposerMenu', () => {
  /**
   * A button at `top` to `bottom` in a window `height` high, a menu `tall`
   * high, and the chat's header ending at `ceiling`, or no header.
   */
  function place(top: number, bottom: number, height: number, tall: number, ceiling?: number) {
    const header =
      ceiling === undefined ? null : { getBoundingClientRect: () => ({ bottom: ceiling }) };
    const tool = {
      getBoundingClientRect: () => ({ top, bottom }),
      ownerDocument: { querySelector: (selector: string) => (selector === 'head' ? header : null) },
    };
    const menu = document.createElement('div');
    Object.defineProperty(menu, 'scrollHeight', { value: tall });
    placeComposerMenu(
      { innerHeight: height },
      { ...PLACES, header: 'head' },
      tool as never,
      menu as never,
    );
    return { place: menu.dataset['place'], room: menu.style.getPropertyValue('--room') };
  }

  it('opens upwards over the chat while there is room for the whole menu above', () => {
    expect(place(700, 740, 760, 400)).toEqual({ place: 'above', room: '684px' });
    expect(place(476, 516, 900, 400, 60)).toEqual({ place: 'above', room: '400px' });
  });

  it('stays below the chat’s header, opening downwards when there is more room there', () => {
    expect(place(300, 340, 900, 400, 60)).toEqual({ place: 'below', room: '544px' });
    expect(place(475, 515, 900, 400, 60)).toEqual({ place: 'above', room: '399px' });
    expect(place(200, 240, 772, 400)).toEqual({ place: 'below', room: '516px' });
  });

  it('stays upwards when neither side has room for it, the larger one, scrolling', () => {
    expect(place(300, 340, 600, 400, 0)).toEqual({ place: 'above', room: '284px' });
    expect(place(10, 50, 50, 400)).toEqual({ place: 'above', room: '0px' });
  });
});

describe('composerToolRender', () => {
  it('sends the button’s helpers, its place, icons and styles along with the content', () => {
    const code = composerToolRender(CONTENT);
    expect(code).toMatch(
      /\{ slot: [\s\S]+, paint: [\s\S]+, build: [\s\S]+, node: [\s\S]+, show: [\s\S]+, wire: [\s\S]+, place: [\s\S]+, keys: [\s\S]+, update: [\s\S]+, item: [\s\S]+, icon: function composerToolIcon[\s\S]+ \}\)$/,
    );
    expect(code).toContain(`"field":${JSON.stringify(LANDMARKS.composer)}`);
    expect(code).toContain(`"footer":${JSON.stringify(LANDMARKS.composerFooter)}`);
    expect(code).toContain('"store":"yapyapComposerToolView"');
    expect(code).toContain('"bridge":"yapyapAssistantBar"');
    // Each way has its own icon; the sparkle stands for Polish and for a way without one.
    const icons = {
      modes: {
        polish: ASSISTANT_ICONS.sparkle,
        shorten: ASSISTANT_ICONS.shorten,
        elaborate: ASSISTANT_ICONS.elaborate,
        soften: ASSISTANT_ICONS.soften,
        formalize: ASSISTANT_ICONS.formalize,
      },
      sparkle: ASSISTANT_ICONS.sparkle,
      caret: ASSISTANT_ICONS.caret,
      check: ASSISTANT_ICONS.check,
      settings: ASSISTANT_ICONS.settings,
    };
    expect(code).toContain(`"icons":${JSON.stringify(icons)}`);
    // The assistant's own accent, in both of WhatsApp's themes, then the button's styles.
    expect(code).toContain('--ai: #4f46e5');
    expect(code).toContain(":host([data-theme='dark'])");
    expect(code).toContain(':host { display: flex;');
    expect(code).toContain('prefers-reduced-motion');
    expect(code).toContain(JSON.stringify(CONTENT));
  });

  // Mutation runs instrument the functions with calls to a module-level
  // helper, so only uninstrumented source can run on its own.
  it.skipIf(composerToolRender(CONTENT).includes('stryMutAct'))(
    'runs as standalone source text, keeping the button in the world it runs in',
    () => {
      document.body.innerHTML = `<div id="main"><footer>${ROW}</footer></div>`;
      // Only the page's document and the window's own functions are in scope, as in the adapter's isolated world.
      const world: Record<string, unknown> = { document, getComputedStyle };
      expect(runInNewContext(composerToolRender(CONTENT), world)).toBe('placed');
      expect(mic()?.previousElementSibling?.tagName).toBe('DIV');
      expect(Object.keys(world)).toEqual([
        'document',
        'getComputedStyle',
        'yapyapComposerToolView',
      ]);
    },
  );
});
