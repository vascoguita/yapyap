import { assistantBarRender, type BarContent } from '../../adapter/assistant-bar.ts';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import type { AssistantBarState } from '../../shared/assistant-bar-api.ts';
import { en } from '../../shared/messages/en.ts';
import type { AssistantBarView } from './bar-sources.ts';

/**
 * How often the bar is put back while it shows. WhatsApp drops it whenever
 * it redraws a chat, and the adapter adds no observers to its page, so a
 * cheap render that changes nothing when nothing changed stands in for one.
 */
const RENDER_EVERY_MS = 1000;

interface BarPage {
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
}

export interface InPageBarPort {
  /** The WhatsApp page of the account on screen. */
  readonly activePage: () => BarPage;
  /** Whether the main window is visible and focused, the only time the bar needs putting back. */
  readonly onScreen: () => boolean;
}

/** The bar's labels in the user's words, and the state as plain JSON. */
function contentOf(state: AssistantBarState, visible: boolean): BarContent {
  const text = en.assistantBar;
  return {
    visible,
    labels: {
      label: text.label,
      from: text.from({ extension: state.extension }),
      suggest: text.suggest,
      use: text.use,
      sendLabel: text.sendLabel,
      write: text.write,
      writePlaceholder: text.writePlaceholder,
    },
    status: state.status,
    suggestions: state.suggestions,
    confirm: state.confirm ?? null,
    working: state.working,
    choice: state.choice ?? null,
  };
}

/** A page that went away, or one between loads, simply has no bar until the next render. */
async function renderIn(page: BarPage, content: BarContent): Promise<void> {
  try {
    await page.executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [
      { code: assistantBarRender(content) },
    ]);
  } catch {
    // Nothing to do: the next render tries again, and the page's text is never logged.
  }
}

/**
 * The assistant bar inside the active account's WhatsApp page, right above
 * the message box (ADR 0013). It renders the bar's current state there
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
  let last: BarPage | undefined;
  const render = (): void => {
    const page = port.activePage();
    if (last !== undefined && last !== page) {
      void renderIn(last, contentOf(state(), false));
    }
    last = page;
    void renderIn(page, contentOf(state(), visible));
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
