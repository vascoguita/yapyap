import { assistantBarRender, type BarContent } from '../../adapter/assistant-bar.ts';
import { composerToolRender, type ToolContent } from '../../adapter/composer-tool.ts';
import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import type { AssistantBarState } from '../../shared/api/assistant-bar-api.ts';
import { en } from '../../shared/messages/en.ts';
import { POLISH_STYLES } from './rewrites.ts';

/** Where the assistant shows and sends its state, once the main window has accounts. */
export interface AssistantBarView {
  readonly show: (visible: boolean) => void;
  readonly publish: (state: AssistantBarState) => void;
}

/**
 * How often the assistant is put back while it shows. WhatsApp drops it
 * whenever it redraws a chat, and the adapter adds no observers to its
 * page, so a cheap render that changes nothing when nothing changed stands
 * in for one.
 */
const RENDER_EVERY_MS = 1000;

export interface InPageBarPort {
  /** The WhatsApp page of the account on screen. */
  readonly activePage: () => AdapterPage;
  /** Whether the main window is visible and focused, the only time the assistant needs putting back. */
  readonly onScreen: () => boolean;
}

/** The bar's labels in the user's words, and the state as plain JSON. */
function contentOf(state: AssistantBarState, visible: boolean): BarContent {
  const text = en.assistant.bar;
  return {
    visible,
    labels: {
      label: text.label,
      suggestions: text.suggestions,
      use: text.use,
      dismiss: text.dismiss,
      close: text.close,
    },
    suggestions: state.suggestions,
    notice: state.notice,
  };
}

/** The message box's rewrite button (#609): its ways in the user's words, and the selected one. */
function toolContentOf(state: AssistantBarState, visible: boolean): ToolContent {
  const text = en.assistant;
  return {
    visible,
    working: state.working,
    current: state.polish,
    options: POLISH_STYLES.map((value) => ({
      value,
      label: text.bar.styles[value],
      hint: text.bar.styleHints[value],
    })),
    labels: {
      label: text.composer.label,
      more: text.composer.more,
      settings: text.composer.settings,
      model: text.composer.model({ model: state.model }),
    },
  };
}

/**
 * The bar and the message box's rewrite button, rendered in one call into
 * the page. Each is on its own, so a page that cannot take one still gets
 * the other.
 */
const renderCode = (state: AssistantBarState, visible: boolean): string =>
  `(() => { try { ${assistantBarRender(contentOf(state, visible))}; } catch { /* The button still shows. */ } ` +
  `try { ${composerToolRender(toolContentOf(state, visible))}; } catch { /* The bar still shows. */ } })()`;

/** A page that went away, or one between loads, simply has neither until the next render. */
async function renderIn(page: AdapterPage, state: AssistantBarState, visible: boolean) {
  try {
    const seen = await runInAdapterWorld(
      page,
      `${renderCode(state, visible)}; (() => { const k = globalThis.yapyapAssistantBarView; return k === undefined ? 'nostore' : [k.host.isConnected, k.parts.notice.hidden, k.host.style.display, k.parts.text.textContent, k.parts.notice.getClientRects().length].join('|'); })()`,
    );
    console.error(`[dbg] ${new Date().toISOString().slice(17,23)} render visible=${String(visible)} notice=${String(state.notice?.text ?? null)} page=${String(seen)}`);
  } catch {
    // Nothing to do: the next render tries again, and the page's text is never logged.
  }
}

/**
 * The assistant inside the active account's WhatsApp page, in and right
 * above the message box (ADR 0013). It renders the current state there
 * whenever it changes or the account on screen does, takes it out of the
 * page of an account no longer on screen, and puts it back about once a
 * second while it shows and the window is on screen.
 */
export function inPageAssistantBar(
  state: () => AssistantBarState,
  port: InPageBarPort,
): AssistantBarView {
  let visible = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let last: AdapterPage | undefined;
  const render = (): void => {
    const page = port.activePage();
    if (last !== undefined && last !== page) {
      void renderIn(last, state(), false);
    }
    last = page;
    void renderIn(page, state(), visible);
  };
  const tick = (): void => {
    if (port.onScreen()) {
      render();
    }
  };
  return {
    show: (shown) => {
      visible = shown;
      clearInterval(timer);
      timer = shown ? setInterval(tick, RENDER_EVERY_MS) : undefined;
      render();
    },
    publish: render,
  };
}
