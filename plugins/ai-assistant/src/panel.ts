import { assistantState, type AssistantState, type PanelRequest } from './bus.ts';

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  compatible: 'an OpenAI-compatible server',
};

const MISSING: Readonly<Record<string, string>> = {
  key: 'Paste your API key to start.',
  model: 'Choose a model in Plugins → AI assistant → Settings.',
  endpoint: 'Enter your server’s https:// address in Plugins → AI assistant → Settings.',
  '': 'Ready.',
};

const UNAVAILABLE = 'The assistant could not read its settings. Try again in a moment.';

/** How often the panel asks for the setup until the hidden page answers. */
const RETRY_MS = 1000;

interface Port {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: PanelRequest): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  properties: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(doc.createElement(tag), properties);
}

/** What the panel says about the setup, never showing the key. */
export function describe(state: AssistantState): string {
  if (state.missing === 'unavailable') {
    return UNAVAILABLE;
  }
  const provider = PROVIDER_NAMES[state.provider] ?? state.provider;
  const model = state.model === '' ? '' : `, model ${state.model}`;
  return `Using ${provider}${model}. ${MISSING[state.missing] ?? ''}`.trim();
}

/**
 * The panel: where the user pastes the key for the provider they chose. The
 * key goes straight to the hidden page, which keeps it with YapYap's
 * secrets API; the panel never shows it again.
 */
export function mountPanel(doc: Document, port: Port): void {
  const status = element(doc, 'p', { id: 'status', textContent: 'Loading…' });
  status.setAttribute('role', 'status');
  const label = element(doc, 'label', { htmlFor: 'key', textContent: 'API key' });
  const input = element(doc, 'input', { id: 'key', type: 'password', autocomplete: 'off' });
  const save = element(doc, 'button', { type: 'submit', textContent: 'Save key' });
  const forget = element(doc, 'button', { type: 'button', textContent: 'Forget key' });
  const form = element(doc, 'form');
  form.append(label, input, save, forget);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    port.postMessage({ type: 'save-key', key: input.value });
    input.value = '';
  });
  forget.addEventListener('click', () => {
    port.postMessage({ type: 'forget-key' });
  });
  // The hidden page may still be loading, and the channel keeps no message
  // for a page not yet listening, so the panel asks until it hears back.
  const ask = (): void => {
    port.postMessage({ type: 'state?' });
  };
  const retry = setInterval(ask, RETRY_MS);
  port.onmessage = (event) => {
    const state = assistantState(event.data);
    if (state !== undefined) {
      clearInterval(retry);
      status.textContent = describe(state);
      forget.disabled = state.missing === 'key';
    }
  };
  doc.body.append(element(doc, 'h1', { textContent: 'AI assistant' }), status, form);
  ask();
}
