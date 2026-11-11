/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildComposerTool,
  composerToolIcon,
  composerToolItem,
  composerToolRender,
  composerToolShine,
  findComposerSlot,
  paintComposerTool,
  renderComposerTool,
  updateComposerTool,
  wireComposerTool,
  type ToolContent,
} from './composer-tool.ts';
import { LANDMARKS } from './page-state.ts';

const option = (value: string, label: string) => ({
  value,
  label,
  hint: `${label} it.`,
  tip: `${label}: ${label} it.`,
});

const CONTENT: ToolContent = {
  visible: true,
  working: false,
  current: 'polish',
  options: [option('polish', 'Polish'), option('elaborate', 'Elaborate')],
  labels: { label: 'Rewrite with AI', more: 'More ways to rewrite' },
};

const PLACES = {
  field: '#main footer [contenteditable="true"]',
  footer: '#main footer',
  store: 'tool',
  bridge: 'bridge',
  style: '.tool { display: flex; }',
  icons: {
    modes: { polish: 'M4 4z', elaborate: 'M5 5z' },
    sparkle: 'M1 1z',
    caret: 'M2 2z',
    check: 'M3 3z',
  },
};

const KIT = {
  slot: findComposerSlot,
  paint: paintComposerTool,
  build: buildComposerTool,
  wire: wireComposerTool,
  update: updateComposerTool,
  item: composerToolItem,
  icon: composerToolIcon,
  shine: composerToolShine,
};

/** WhatsApp's message box as it lays it out: attach, the field in its own box, then the microphone. */
const ROW =
  '<div class="row" style="color: rgb(250, 250, 250); background-color: rgb(36, 38, 38)">' +
  '<div><button>+</button></div><div class="box"><div contenteditable="true"></div></div>' +
  '<div class="mic"><button>Voice</button></div></div>';

interface Kept {
  host: HTMLElement;
  parts: {
    tool: HTMLElement;
    apply: HTMLButtonElement;
    more: HTMLButtonElement;
    menu: HTMLElement;
  };
}

/** An open chat, the scope the adapter world would be, and the bar's bridge. */
function setup(row = ROW) {
  document.body.innerHTML = `<div id="main"><footer>${row}</footer></div>`;
  const bridge = { polish: vi.fn() };
  const scope: Record<string, unknown> = { bridge, getComputedStyle };
  const render = (content: ToolContent = CONTENT) =>
    renderComposerTool(document, scope, content, PLACES, KIT);
  const kept = (): Kept => scope['tool'] as Kept;
  // The test reaches into the closed shadow root through the parts the adapter keeps.
  const shadow = (): ShadowRoot => kept().parts.tool.getRootNode() as ShadowRoot;
  const items = (): HTMLButtonElement[] => [
    ...kept().parts.menu.querySelectorAll<HTMLButtonElement>('.item'),
  ];
  return { bridge, scope, render, kept, shadow, items };
}

/** An event as the user's own input makes it; page scripts can only make untrusted ones. */
function trusted<T extends Event>(event: T): T {
  Object.defineProperty(event, 'isTrusted', { value: true });
  return event;
}

const click = (target: Element): void => {
  target.dispatchEvent(trusted(new MouseEvent('click', { bubbles: true })));
};

const mic = (): Element | null => document.querySelector('.mic');

afterEach(() => {
  document.body.innerHTML = '';
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
    expect(parts.apply.getAttribute('aria-label')).toBe('Polish');
    expect(parts.apply.getAttribute('title')).toBe('Polish: Polish it.');
    expect(parts.apply.type).toBe('button');
    // The button shows the selected way: its own icon, in the edge's gradient, and its name.
    const mode = parts.apply.querySelector('svg');
    expect(mode?.getAttribute('class')).toBe('mode');
    expect(mode?.querySelector('path')?.getAttribute('d')).toBe('M4 4z');
    expect(parts.apply.querySelector('.label')?.textContent).toBe('Polish');
    expect(parts.more.getAttribute('aria-label')).toBe('More ways to rewrite');
    expect(parts.more.getAttribute('title')).toBe('More ways to rewrite');
    expect(parts.more.getAttribute('aria-haspopup')).toBe('menu');
    expect(parts.more.getAttribute('aria-expanded')).toBe('false');
    expect(parts.more.querySelector('path')?.getAttribute('d')).toBe('M2 2z');
    expect(parts.menu.getAttribute('role')).toBe('menu');
    expect(parts.menu.hidden).toBe(true);
  });

  it('paints the ways’ icons with the gradient of its edge, kept in its own shadow root', () => {
    const t = setup();
    t.render();
    const shine = t.shadow().querySelector('.defs linearGradient');
    expect(shine?.getAttribute('id')).toBe('shine');
    expect([shine?.getAttribute('x2'), shine?.getAttribute('y2')]).toEqual(['1', '1']);
    expect(t.shadow().querySelector('.defs')?.getAttribute('aria-hidden')).toBe('true');
    expect(
      [...(shine?.querySelectorAll('stop') ?? [])].map((stop) => [
        stop.getAttribute('offset'),
        stop.getAttribute('stop-color'),
      ]),
    ).toEqual([
      ['0', '#25d366'],
      ['0.5', '#53bdeb'],
      ['1', '#a78bfa'],
    ]);
  });

  it('lists every way with what it does, and ticks the selected one', () => {
    const t = setup();
    t.render();
    expect(
      t
        .items()
        .map((item) => [
          item.getAttribute('role'),
          item.getAttribute('aria-checked'),
          item.dataset['value'],
          item.querySelector('.name')?.textContent,
          item.querySelector('.hint')?.textContent,
          item.type,
        ]),
    ).toEqual([
      ['menuitemradio', 'true', 'polish', 'Polish', 'Polish it.', 'button'],
      ['menuitemradio', 'false', 'elaborate', 'Elaborate', 'Elaborate it.', 'button'],
    ]);
  });

  it('shows each way’s icon, and a tick, in the list', () => {
    const t = setup();
    t.render();
    /** An icon as the list draws it: its class, kind, box, whether it is hidden from readers, and shape. */
    const icon = (node: Element | undefined) => [
      node?.getAttribute('class'),
      node?.namespaceURI,
      node?.getAttribute('viewBox'),
      node?.getAttribute('aria-hidden'),
      node?.querySelector('path')?.getAttribute('d'),
    ];
    const svg = 'http://www.w3.org/2000/svg';
    const [polish, elaborate] = t.items().map((item) => [...item.children]);
    expect(icon(polish?.[0])).toEqual(['mode', svg, '0 0 24 24', 'true', 'M4 4z']);
    expect(icon(elaborate?.[0])).toEqual(['mode', svg, '0 0 24 24', 'true', 'M5 5z']);
    expect(icon(polish?.[3])).toEqual(['check', svg, '0 0 24 24', 'true', 'M3 3z']);
  });

  it('writes the ways as text, never as markup, with the sparkles for a way without an icon', () => {
    const t = setup();
    t.render({ ...CONTENT, current: 'louder', options: [option('louder', '<b>Louder</b>')] });
    expect(t.items()[0]?.querySelector('.name')?.textContent).toBe('<b>Louder</b>');
    expect(t.kept().parts.apply.querySelector('.label')?.textContent).toBe('<b>Louder</b>');
    expect(t.shadow().querySelector('b')).toBeNull();
    expect(t.items()[0]?.querySelector('.mode path')?.getAttribute('d')).toBe('M1 1z');
  });

  it('takes WhatsApp’s colors from the message box, render after render', () => {
    const t = setup();
    t.render();
    const { style } = t.kept().host;
    expect(style.getPropertyValue('--wa-text')).toBe('rgb(250, 250, 250)');
    expect(style.getPropertyValue('--wa-surface')).toBe('rgb(36, 38, 38)');
    document.querySelector<HTMLElement>('.row')?.style.setProperty('color', 'rgb(17, 27, 33)');
    t.render();
    expect(style.getPropertyValue('--wa-text')).toBe('rgb(17, 27, 33)');
  });

  it('changes nothing when nothing changed, and shows the work and the selected way', () => {
    const t = setup();
    t.render();
    const items = t.items();
    t.render();
    expect(t.items()).toEqual(items);
    t.render({ ...CONTENT, working: true, current: 'elaborate' });
    const { tool, apply, more } = t.kept().parts;
    expect(tool.getAttribute('aria-busy')).toBe('true');
    expect([apply.disabled, more.disabled]).toEqual([true, true]);
    expect(apply.getAttribute('aria-label')).toBe('Elaborate');
    expect(apply.querySelector('.label')?.textContent).toBe('Elaborate');
    expect(apply.querySelector('.mode path')?.getAttribute('d')).toBe('M5 5z');
    expect(t.items().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    t.render({ ...CONTENT, current: 'louder' });
    expect([apply.disabled, more.disabled]).toEqual([true, false]);
    expect(apply.getAttribute('aria-label')).toBe('Rewrite with AI');
    expect(apply.getAttribute('title')).toBe('Rewrite with AI');
    // A way without an icon of its own, or none selected, shows the sparkles.
    expect(apply.querySelector('.label')?.textContent).toBe('Rewrite with AI');
    expect(apply.querySelector('.mode path')?.getAttribute('d')).toBe('M1 1z');
    expect(tool.getAttribute('aria-busy')).toBe('false');
  });

  it('puts the same button back when WhatsApp redraws the message box', () => {
    const t = setup();
    t.render();
    const { host } = t.kept();
    document.querySelector('footer')?.replaceChildren();
    document.querySelector('footer')?.insertAdjacentHTML('beforeend', ROW);
    expect(t.render()).toBe('placed');
    expect(t.kept().host).toBe(host);
    expect(mic()?.previousElementSibling).toBe(host);
  });

  it('takes the button away when it is hidden or no chat is open, and reports it', () => {
    const t = setup();
    t.render();
    expect(t.render({ ...CONTENT, visible: false })).toBe('away');
    expect(t.kept().host.isConnected).toBe(false);
    t.render();
    document.body.innerHTML = '';
    expect(t.render()).toBe('away');
    expect(t.kept().host.isConnected).toBe(false);
  });

  it('stays away from a message box laid out in another way', () => {
    const away = (row: string): void => {
      const t = setup(row);
      expect(t.render()).toBe('away');
      expect(t.scope['tool']).toBeUndefined();
    };
    // The field's box is the row's last part, so no microphone follows it.
    away(
      '<div class="row"><div><button>+</button></div><div><div contenteditable="true"></div></div></div>',
    );
    // The field sits right in the footer, with no row of its own.
    away('<div contenteditable="true"></div>');
    expect(setup().render({ ...CONTENT, visible: false })).toBe('away');
  });
});

describe('the button’s controls', () => {
  it('rewrite in the selected way on the user’s click, never on a click a page script made up', () => {
    const t = setup();
    t.render();
    const { apply } = t.kept().parts;
    apply.click();
    expect(t.bridge.polish).not.toHaveBeenCalled();
    click(apply);
    expect(t.bridge.polish.mock.calls).toEqual([['polish']]);
    // A click on the icon inside counts as one on the button.
    const icon = apply.querySelector('svg');
    if (icon === null) {
      throw new Error('No icon.');
    }
    click(icon);
    expect(t.bridge.polish).toHaveBeenCalledTimes(2);
    click(t.kept().parts.tool);
    expect(t.bridge.polish).toHaveBeenCalledTimes(2);
  });

  it('open the list upwards on the arrow, and rewrite in the way the user picks', () => {
    const t = setup();
    t.render();
    const { more, menu } = t.kept().parts;
    click(more);
    expect(menu.hidden).toBe(false);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    // The list takes the focus, so it closes once the focus leaves it.
    expect(t.shadow().activeElement).toBe(menu);
    expect(menu.getAttribute('tabindex')).toBe('-1');
    click(more);
    expect(menu.hidden).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    click(more);
    const [, elaborate] = t.items();
    if (elaborate === undefined) {
      throw new Error('No Elaborate.');
    }
    click(elaborate);
    expect(t.bridge.polish.mock.calls).toEqual([['elaborate']]);
    expect(menu.hidden).toBe(true);
  });

  it('close the list on Escape, back on the arrow, or once the focus leaves it', () => {
    const t = setup();
    t.render();
    const { more, menu, tool } = t.kept().parts;
    const escape = (): void => {
      tool.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    };
    escape();
    expect(t.shadow().activeElement).not.toBe(more);
    click(more);
    escape();
    expect(menu.hidden).toBe(true);
    expect(t.shadow().activeElement).toBe(more);
    click(more);
    const inside = new FocusEvent('focusout', { bubbles: true, relatedTarget: more });
    t.items()[0]?.dispatchEvent(inside);
    expect(menu.hidden).toBe(false);
    t.items()[0]?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('keep the focus in the message box, and keys in the list from WhatsApp’s shortcuts', () => {
    const t = setup();
    t.render();
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    t.kept().parts.apply.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    const shortcut = vi.fn();
    document.addEventListener('keydown', shortcut);
    t.kept().parts.more.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }),
    );
    document.removeEventListener('keydown', shortcut);
    expect(shortcut).not.toHaveBeenCalled();
  });

  it('do nothing while the preload has not given the bar its bridge', () => {
    const t = setup();
    delete t.scope['bridge'];
    t.render();
    expect(() => {
      click(t.kept().parts.apply);
    }).not.toThrow();
  });
});

describe('composerToolRender', () => {
  it('sends the button’s helpers, its place, icons and styles along with the content', () => {
    const code = composerToolRender(CONTENT);
    expect(code).toMatch(
      /\{ slot: [\s\S]+, paint: [\s\S]+, build: [\s\S]+, wire: [\s\S]+, update: [\s\S]+, item: [\s\S]+, icon: [\s\S]+ \}\)$/,
    );
    expect(code).toContain(`"field":${JSON.stringify(LANDMARKS.composer)}`);
    expect(code).toContain(`"footer":${JSON.stringify(LANDMARKS.composerFooter)}`);
    expect(code).toContain('"store":"yapyapComposerToolView"');
    expect(code).toContain('"bridge":"yapyapAssistantBar"');
    expect(code).toContain('"sparkle":"M10.5 3.5');
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
