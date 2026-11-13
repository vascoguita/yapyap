import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantBarState } from '../../shared/api/assistant-bar-api.ts';
import { inPageAssistantBar } from './bar-page.ts';

const STATE: AssistantBarState = {
  working: true,
  suggestions: ['On my way'],
  notice: null,
  polish: 'soften',
  model: 'Haiku',
};

function fakePage() {
  return {
    executeJavaScriptInIsolatedWorld: vi.fn<
      (world: number, scripts: { code: string }[]) => Promise<unknown>
    >(() => Promise.resolve(undefined)),
  };
}

/** The code a render ran in the page's adapter world. */
function codeOf(page: ReturnType<typeof fakePage>, call = -1): string {
  const [world, scripts] = page.executeJavaScriptInIsolatedWorld.mock.calls.at(call) ?? [];
  expect(world).toBe(1000);
  return scripts?.[0]?.code ?? '';
}

/** The content a render sent, read back from its code: the bar's, or the rewrite button's. */
function contentOf(page: ReturnType<typeof fakePage>, call = -1, of = 'footer'): unknown {
  const pattern = new RegExp(String.raw`\(document, globalThis, (\{.*?\}), \{"${of}"`);
  return JSON.parse(pattern.exec(codeOf(page, call))?.[1] ?? 'null');
}

function setup() {
  let active = fakePage();
  const onScreen = vi.fn(() => true);
  let state = STATE;
  const view = inPageAssistantBar(() => state, { activePage: () => active, onScreen });
  return {
    view,
    onScreen,
    page: () => active,
    switchTo: (page: ReturnType<typeof fakePage>) => {
      active = page;
    },
    setState: (next: AssistantBarState) => {
      state = next;
    },
  };
}

describe('inPageAssistantBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the suggestions and the notice in the active page’s adapter world, in the user’s words', () => {
    const t = setup();
    t.view.show(true);
    expect(contentOf(t.page())).toEqual({
      visible: true,
      labels: {
        label: 'AI assistant',
        suggestions: 'Suggested replies',
        use: 'Puts this reply in the message box, for you to edit or send.',
        dismiss: 'Dismiss suggestions',
        close: 'Close',
      },
      suggestions: ['On my way'],
      notice: null,
    });
    const notice = {
      text: 'Softened. Edit it or send as is.',
      button: { id: 'undo', label: 'Undo' },
    } as const;
    t.setState({ ...STATE, notice });
    t.view.publish(STATE);
    expect(contentOf(t.page())).toEqual(expect.objectContaining({ notice }));
    t.view.show(false);
    expect(contentOf(t.page())).toEqual(expect.objectContaining({ visible: false }));
  });

  it('renders the message box’s rewrite button with the bar, each on its own', () => {
    const t = setup();
    t.view.show(true);
    const code = codeOf(t.page());
    expect(code).toMatch(
      /^\(\(\) => \{ try \{ \(function renderAssistantBar[\s\S]+\} catch \{[^}]*\} try \{ \(function renderComposerTool[\s\S]+\} catch \{[^}]*\} \}\)\(\)$/,
    );
    expect(contentOf(t.page(), -1, 'field')).toEqual({
      visible: true,
      working: true,
      current: 'soften',
      options: [
        { value: 'polish', label: 'Polish', hint: 'Fix grammar and flow, keep your meaning' },
        { value: 'shorten', label: 'Shorten', hint: 'Same message, fewer words' },
        { value: 'elaborate', label: 'Elaborate', hint: 'Add detail or polite phrasing' },
        { value: 'soften', label: 'Soften', hint: 'Gentler, friendlier tone' },
        { value: 'formalize', label: 'Formalize', hint: 'More professional tone' },
      ],
      labels: {
        label: 'Rewrite with AI',
        more: 'Choose how to rewrite',
        settings: 'Assistant settings',
        model: 'Model: Haiku',
      },
    });
    t.view.show(false);
    expect(contentOf(t.page(), -1, 'field')).toEqual(expect.objectContaining({ visible: false }));
  });

  it('takes the assistant out of a page whose account is no longer on screen', () => {
    const t = setup();
    const first = t.page();
    t.view.show(true);
    const second = fakePage();
    t.switchTo(second);
    t.view.publish(STATE);
    expect(contentOf(first)).toEqual(expect.objectContaining({ visible: false }));
    expect(contentOf(second)).toEqual(expect.objectContaining({ visible: true }));
    t.view.publish(STATE);
    expect(first.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
  });

  it('puts the assistant back every second while it shows and the window is on screen', () => {
    const t = setup();
    t.view.show(true);
    t.view.show(true);
    vi.advanceTimersByTime(1000);
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(3);
    t.onScreen.mockReturnValue(false);
    vi.advanceTimersByTime(3000);
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(3);
    t.onScreen.mockReturnValue(true);
    t.view.show(false);
    vi.advanceTimersByTime(3000);
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(4);
  });

  it('shrugs off a page that cannot run it, now or at once', async () => {
    const t = setup();
    t.page().executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(new Error('loading'));
    t.page().executeJavaScriptInIsolatedWorld.mockImplementationOnce(() => {
      throw new Error('Object has been destroyed');
    });
    t.view.show(true);
    t.view.show(true);
    await vi.runOnlyPendingTimersAsync();
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(3);
  });
});
