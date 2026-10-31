/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alignAssistantBar,
  assistantBarRender,
  assistantSuggestion,
  buildAssistantBar,
  renderAssistantBar,
  updateAssistantBar,
  updateAssistantChoice,
  wireAssistantBar,
  type BarContent,
} from './assistant-bar.ts';
import { LANDMARKS } from './page-state.ts';

const LABELS = {
  label: 'AI suggestions',
  from: 'From Assistant',
  suggest: 'Suggest replies',
  use: 'Put in the message box',
  sendLabel: 'Send this suggestion now',
  write: 'Write a message',
  writePlaceholder: 'Say what you want to write',
};

const CONTENT: BarContent = {
  visible: true,
  labels: LABELS,
  status: '',
  suggestions: ['On my way', '<b>Soon</b>'],
  confirm: null,
  working: false,
  choice: null,
};

const PLACES = {
  footer: '#main footer',
  store: 'bar',
  bridge: 'bridge',
  style: '.bar { display: flex; }',
  maxPrompt: 2000,
};

const KIT = {
  align: alignAssistantBar,
  build: buildAssistantBar,
  wire: wireAssistantBar,
  update: updateAssistantBar,
  choose: updateAssistantChoice,
  suggestion: assistantSuggestion,
};

interface Stored {
  host: HTMLElement;
  parts: {
    input: HTMLInputElement;
    confirm: HTMLButtonElement;
    suggest: HTMLButtonElement;
    choice: HTMLSelectElement;
  };
}

/** A chat with its message box, the scope the adapter world would be, and the bar's bridge. */
function setup() {
  // WhatsApp orders the chat's parts with flexbox `order` and raises its message box (#466).
  document.body.innerHTML =
    '<div id="main"><div role="row">Hi</div><footer style="order: 3; z-index: 2"><div contenteditable="true"></div></footer></div>';
  const bridge = {
    suggest: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    use: vi.fn(),
    send: vi.fn(),
    choose: vi.fn(),
  };
  const scope: Record<string, unknown> = { bridge, getComputedStyle };
  const render = (content: BarContent = CONTENT): boolean =>
    renderAssistantBar(document, scope, content, PLACES, KIT);
  const stored = (): Stored => scope['bar'] as Stored;
  // The test reaches into the closed shadow root through the parts the adapter keeps.
  const shadow = (): ShadowRoot => stored().parts.input.getRootNode() as ShadowRoot;
  return { bridge, scope, render, stored, shadow };
}

/** An event as the user's own input makes it; page scripts can only make untrusted ones. */
function trusted<T extends Event>(event: T): T {
  Object.defineProperty(event, 'isTrusted', { value: true });
  return event;
}

const footer = (): Element | null => document.querySelector('#main footer');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderAssistantBar', () => {
  it('puts the bar right above the message box, in a closed shadow root', () => {
    const t = setup();
    expect(t.render()).toBe(true);
    const { host } = t.stored();
    expect(footer()?.previousElementSibling).toBe(host);
    expect(host.shadowRoot).toBeNull();
    const shadow = t.shadow();
    expect(shadow.querySelector('style')?.textContent).toBe('.bar { display: flex; }');
    expect(shadow.querySelector('.bar')?.getAttribute('aria-label')).toBe('AI suggestions');
    expect(shadow.querySelector('.from')?.textContent).toBe('From Assistant');
    expect(t.stored().parts.input.getAttribute('maxlength')).toBe('2000');
    expect(t.stored().parts.input.placeholder).toBe('Say what you want to write');
    expect(t.stored().parts.confirm.hidden).toBe(true);
    // The classes the bar's own styles hang on.
    expect(shadow.querySelector('.bar > .row')).not.toBeNull();
    expect(t.stored().parts.confirm.className).toBe('button');
    expect(t.stored().parts.input.className).toBe('input');
    expect(t.stored().parts.input.getAttribute('type')).toBe('text');
  });

  it('takes the message box’s place in WhatsApp’s layout, above its wallpaper, render after render', () => {
    const t = setup();
    t.render();
    const { host } = t.stored();
    expect([host.style.order, host.style.position, host.style.zIndex]).toEqual([
      '3',
      'relative',
      '2',
    ]);
    footer()?.setAttribute('style', 'order: 7; z-index: 5');
    t.render();
    expect([host.style.order, host.style.zIndex]).toEqual(['7', '5']);
  });

  it('leaves a bar already right above the message box where it is', () => {
    const t = setup();
    t.render();
    const box = footer();
    if (box === null) {
      throw new Error('No footer.');
    }
    const before = vi.spyOn(box, 'before');
    t.render({ ...CONTENT, status: 'Thinking…' });
    expect(before).not.toHaveBeenCalled();
  });

  it('writes the extension’s text as text, never as markup', () => {
    const t = setup();
    t.render({ ...CONTENT, status: '<i>busy</i>', confirm: '<u>Yes</u>' });
    const shadow = t.shadow();
    const uses = [...shadow.querySelectorAll('.use')].map((use) => use.textContent);
    expect(uses).toEqual(['On my way', '<b>Soon</b>']);
    expect(shadow.querySelector('b')).toBeNull();
    expect(shadow.querySelector('.status')?.textContent).toBe('<i>busy</i>');
    expect(t.stored().parts.confirm.textContent).toBe('<u>Yes</u>');
    expect(t.stored().parts.confirm.hidden).toBe(false);
    const send = shadow.querySelector('.send');
    expect(send?.getAttribute('aria-label')).toBe('Send this suggestion now');
    expect(send?.getAttribute('data-index')).toBe('0');
    expect(send?.querySelector('svg path')).not.toBeNull();
  });

  it('changes nothing when nothing changed, and updates in place when something did', () => {
    const t = setup();
    t.render();
    const { host } = t.stored();
    const list = t.shadow().querySelector('.suggestions');
    const first = list?.firstElementChild;
    t.render();
    expect(list?.firstElementChild).toBe(first);
    t.render({ ...CONTENT, suggestions: [], working: true, status: 'Thinking…' });
    expect(t.stored().host).toBe(host);
    expect(list?.children).toHaveLength(0);
    expect(t.stored().parts.suggest.disabled).toBe(true);
    expect(t.stored().parts.input.disabled).toBe(true);
  });

  it('puts the same bar back when WhatsApp redraws the chat, and above the new message box', () => {
    const t = setup();
    t.render();
    const { host } = t.stored();
    t.stored().parts.input.value = 'half typed';
    document.querySelector('#main')?.replaceChildren();
    document.querySelector('#main')?.insertAdjacentHTML('beforeend', '<footer></footer>');
    expect(t.render()).toBe(true);
    expect(footer()?.previousElementSibling).toBe(host);
    expect(t.stored().parts.input.value).toBe('half typed');
    footer()?.before(document.createElement('div'));
    t.render();
    expect(footer()?.previousElementSibling).toBe(host);
  });

  it('takes the bar away when it is hidden or no chat is open, and reports it', () => {
    const t = setup();
    expect(t.render({ ...CONTENT, visible: false })).toBe(false);
    expect(t.scope['bar']).toBeUndefined();
    t.render();
    expect(t.render({ ...CONTENT, visible: false })).toBe(false);
    expect(t.stored().host.isConnected).toBe(false);
    t.render();
    footer()?.remove();
    expect(t.render()).toBe(false);
    expect(t.stored().host.isConnected).toBe(false);
  });
});

describe('the bar’s buttons and field', () => {
  it('act on the user’s clicks only, never on clicks a page script made up', () => {
    const t = setup();
    t.render({ ...CONTENT, confirm: 'Yes' });
    const shadow = t.shadow();
    const click = (selector: string, event = trusted(new MouseEvent('click', { bubbles: true }))) =>
      shadow.querySelector(selector)?.dispatchEvent(event);
    click('.primary', new MouseEvent('click', { bubbles: true }));
    shadow.querySelector<HTMLElement>('.send')?.click();
    expect(Object.values(t.bridge).flatMap((act) => act.mock.calls)).toEqual([]);
    click('.primary');
    click('[data-action="confirm"]');
    click('.use');
    click('li:nth-child(2) .send path');
    click('.suggestions');
    expect(t.bridge.suggest).toHaveBeenCalledOnce();
    expect(t.bridge.confirm).toHaveBeenCalledOnce();
    expect(t.bridge.use).toHaveBeenCalledExactlyOnceWith(0);
    expect(t.bridge.send).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('shows the extension’s choice beside its name, and passes on only the user’s pick', () => {
    const t = setup();
    t.render();
    const { choice } = t.stored().parts;
    expect(choice.hidden).toBe(true);
    const options = [
      { value: 'fast', label: 'Fast <i>' },
      { value: 'smart', label: 'Smart' },
    ];
    t.render({ ...CONTENT, choice: { label: 'Model', current: 'smart', options } });
    expect(choice.hidden).toBe(false);
    expect(choice.getAttribute('aria-label')).toBe('Model');
    expect([...choice.options].map((option) => [option.value, option.textContent])).toEqual([
      ['fast', 'Fast <i>'],
      ['smart', 'Smart'],
    ]);
    expect(choice.value).toBe('smart');
    expect(choice.previousElementSibling?.className).toBe('from');
    choice.value = 'fast';
    choice.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.bridge.choose).not.toHaveBeenCalled();
    choice.dispatchEvent(trusted(new Event('change', { bubbles: true })));
    expect(t.bridge.choose).toHaveBeenCalledExactlyOnceWith('fast');
    t.render({ ...CONTENT, working: true, choice: { label: 'Model', current: 'fast', options } });
    expect(choice.disabled).toBe(true);
  });

  it('asks with what the user typed on Enter, then clears the field', () => {
    const t = setup();
    t.render();
    const { input } = t.stored().parts;
    const press = (key: string, init: KeyboardEventInit = {}) => {
      const event = trusted(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
      );
      input.dispatchEvent(event);
      return event;
    };
    input.value = '   ';
    press('Enter');
    input.value = 'say I am late';
    press('a');
    press('Enter', { isComposing: true });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.bridge.prompt).not.toHaveBeenCalled();
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(t.bridge.prompt).toHaveBeenCalledExactlyOnceWith('say I am late');
    expect(input.value).toBe('');
  });

  it('keeps typing in the bar from reaching WhatsApp’s own keyboard handlers', () => {
    const t = setup();
    t.render();
    const heard = vi.fn();
    for (const type of [
      'keydown',
      'keyup',
      'keypress',
      'beforeinput',
      'input',
      'paste',
      'cut',
      'copy',
    ]) {
      document.addEventListener(type, heard);
      t.stored().parts.input.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    }
    expect(heard).not.toHaveBeenCalled();
  });

  it('does nothing while the preload has not given the bar its bridge', () => {
    const t = setup();
    delete t.scope['bridge'];
    t.render();
    const use = t.shadow().querySelector('.use');
    use?.dispatchEvent(trusted(new MouseEvent('click', { bubbles: true })));
    const { input } = t.stored().parts;
    input.value = 'Say hi';
    input.dispatchEvent(trusted(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(t.bridge.use).not.toHaveBeenCalled();
    expect(t.bridge.prompt).not.toHaveBeenCalled();
  });

  it('labels its field, leaves an unasked question blank, and draws the send arrow', () => {
    const t = setup();
    t.render();
    expect(t.stored().parts.input.getAttribute('aria-label')).toBe('Write a message');
    expect(t.stored().parts.confirm.textContent).toBe('');
    const icon = t.shadow().querySelector('.send svg');
    expect(icon?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('M2 8l12-6-4 12-2-5z');
  });
});

describe('assistantBarRender', () => {
  it('sends the bar’s helpers, its place and its own styles along with the content', () => {
    const code = assistantBarRender(CONTENT);
    expect(code).toMatch(
      /\{ align: [\s\S]+, build: [\s\S]+, wire: [\s\S]+, update: [\s\S]+, suggestion: [\s\S]+ \}\)$/,
    );
    expect(code).toContain('"store":"yapyapAssistantBarView"');
    expect(code).toContain(':host { display: block; color-scheme: light dark; }');
    expect(code).toContain(JSON.stringify(CONTENT));
  });

  // Mutation runs instrument the functions with calls to a module-level
  // helper, so only uninstrumented source can run on its own.
  it.skipIf(assistantBarRender(CONTENT).includes('stryMutAct'))(
    'runs as standalone source text, keeping the bar in the world it runs in',
    () => {
      document.body.innerHTML = '<div id="main"><footer></footer></div>';
      const code = assistantBarRender(CONTENT);
      expect(code).toContain(JSON.stringify(LANDMARKS.composerFooter));
      // Only the page's document and the window's own functions are in scope, as in the adapter's isolated world.
      const world: Record<string, unknown> = { document, getComputedStyle };
      expect(runInNewContext(code, world)).toBe(true);
      expect(footer()?.previousElementSibling?.tagName).toBe('DIV');
      expect(Object.keys(world)).toEqual([
        'document',
        'getComputedStyle',
        'yapyapAssistantBarView',
      ]);
    },
  );
});
