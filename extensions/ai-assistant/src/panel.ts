import { aboutSize } from './built-in/catalog.ts';
import {
  update,
  type AssistantState,
  type CatchUp,
  type KeyRequest,
  type LocalView,
  type PanelRequest,
  type Preview,
  type Update,
} from './bus.ts';
import type { RewriteStyle } from './rewrites.ts';

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  compatible: 'an OpenAI-compatible server',
  local: 'a model server on this computer',
  'built-in': 'the private model on this computer',
};

/** What the panel and the bar say when a server on this computer the assistant uses does not answer. */
const LOCAL_SERVER =
  'The model server on this computer does not answer. Start it, such as by opening Ollama or Alpaca. If you denied the assistant access, restart YapYap to be asked again.';

const MISSING: Readonly<Record<string, string>> = {
  key: 'Paste your API key to start.',
  model: 'Choose a model in Extensions → AI assistant → Settings.',
  endpoint: 'Enter your server’s https:// address in Extensions → AI assistant → Settings.',
  'local-only':
    'Local-only mode is on: choose the compatible provider with a server on this computer, such as http://localhost:11434/v1.',
  'local-server': LOCAL_SERVER,
  download: 'Download it below to start.',
  '': 'Ready.',
};

const UNAVAILABLE = 'The assistant could not read its settings. Try again in a moment.';

/** What each problem the hidden page reports means to the user. */
const PROBLEMS: Readonly<Record<string, string>> = {
  'no-chat': 'Open a chat first.',
  'empty-draft': 'Type a draft in the message box first.',
  setup: 'Finish the setup above first.',
  'not-prepared': 'Look at the chat again first.',
  'no-unread': 'No chat in the chat list has unread messages.',
  'unread-not-granted':
    'YapYap does not let the assistant see your unread chats in this account. Turn on “See which chats have unread messages, and the latest message of each” in Extensions → AI assistant.',
  'not-granted': 'YapYap does not allow the assistant this here. Check Extensions → AI assistant.',
  auth: 'The provider did not accept your key.',
  'rate-limited': 'The provider is busy or your quota is used up. Try again later.',
  network: 'The provider could not be reached.',
  timeout: 'The provider took too long to answer.',
  refused: 'The model declined to answer.',
  'bad-request': 'The provider did not accept the request. Check the model’s name.',
  cancelled: 'Stopped.',
  'out-of-memory':
    'This computer doesn’t have enough memory for this model. Try the smaller one below?',
  'local-server': LOCAL_SERVER,
  'no-server':
    'No AI model runs on this computer. Install Ollama from ollama.com and download a model, or choose a provider in Extensions → AI assistant → Settings.',
  'no-models':
    'A model server runs on this computer, but it has no model yet. Download one in it, then try again.',
  'search-refused':
    'You did not let the assistant look on this computer. To be asked again, turn its “Connect to servers running on this computer” off and on in Extensions.',
  'search-unsupported': 'Update YapYap to find a model on this computer.',
  'search-failed': 'Looking for a model on this computer failed. Try again.',
};

const SOMETHING_WRONG = 'Something went wrong. Try again.';

/** The offer to find a model on this computer, in the panel and the bar (#456). */
export const SEARCH_OFFER =
  'Use an AI model on this computer? It stays private: your messages never leave it.';
export const SEARCH = 'Find a model';

/** YapYap's panel style (#396) marks the action a section is about. */
const PRIMARY = 'yapyap-primary';

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

/** What a problem means to the user. */
export const problemText = (reason: string): string => PROBLEMS[reason] ?? SOMETHING_WRONG;

/**
 * Sends a key request until the hidden page answers it. The channel keeps
 * nothing for a page that is not listening, as while it reloads, so a key
 * saved then would be lost; saving or forgetting it twice does no harm. A
 * state that answers another request, such as the one a page sends as it
 * starts, does not count.
 */
function keyDelivery(port: Port): {
  send: (request: Extract<PanelRequest, { type: KeyRequest }>) => void;
  answered: (state: AssistantState) => void;
} {
  let pending: { type: KeyRequest; timer: ReturnType<typeof setInterval> } | undefined;
  const stop = (): void => {
    clearInterval(pending?.timer);
    pending = undefined;
  };
  return {
    send: (request) => {
      stop();
      port.postMessage(request);
      pending = {
        type: request.type,
        timer: setInterval(() => {
          port.postMessage(request);
        }, RETRY_MS),
      };
    },
    answered: (state) => {
      if (state.answers === pending?.type) {
        stop();
      }
    },
  };
}

/** The key form: paste, save, forget. The key is never shown again. */
function keySection(
  doc: Document,
  port: Port,
): { section: HTMLElement; show: (s: AssistantState) => void } {
  const status = element(doc, 'p', { id: 'status', textContent: 'Loading…' });
  status.setAttribute('role', 'status');
  const label = element(doc, 'label', { htmlFor: 'key', textContent: 'API key' });
  const input = element(doc, 'input', { id: 'key', type: 'password', autocomplete: 'off' });
  const save = element(doc, 'button', {
    type: 'submit',
    textContent: 'Save key',
    className: PRIMARY,
  });
  const forget = element(doc, 'button', { type: 'button', textContent: 'Forget key' });
  const form = element(doc, 'form');
  form.append(label, input, save, forget);
  const key = keyDelivery(port);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    key.send({ type: 'save-key', key: input.value });
    input.value = '';
  });
  forget.addEventListener('click', () => {
    key.send({ type: 'forget-key' });
  });
  // Someone who set nothing up can use a model already running on this computer instead (#456).
  const search = element(doc, 'div', { id: 'find', hidden: true });
  search.append(
    element(doc, 'p', { textContent: SEARCH_OFFER }),
    asking(doc, port, SEARCH, { type: 'find-model' }, true),
  );
  const section = element(doc, 'section');
  section.append(status, search, form);
  const show = (state: AssistantState): void => {
    key.answered(state);
    status.textContent = describe(state);
    forget.disabled = state.missing === 'key';
    search.hidden = !state.search;
  };
  return { section, show };
}

/** A button that sends `request` to the hidden page; `primary` for the step to take next. */
function asking(doc: Document, port: Port, label: string, request: PanelRequest, primary = false) {
  const button = element(doc, 'button', {
    type: 'button',
    textContent: label,
    className: primary ? PRIMARY : '',
  });
  button.addEventListener('click', () => {
    port.postMessage(request);
  });
  return button;
}

/** The preview: exactly what would be sent, or the offer to allow the assistant in this chat. */
function previewOf(doc: Document, port: Port, preview: Preview): HTMLElement[] {
  if (!preview.allowed) {
    return [
      element(doc, 'p', { textContent: `The assistant is off in “${preview.chat}”.` }),
      asking(doc, port, 'Allow in this chat', { type: 'allow-chat', allowed: true }, true),
    ];
  }
  const sent = element(doc, 'pre', {
    id: 'preview',
    textContent: `${preview.instructions}\n\n${preview.transcript}`,
  });
  return [
    element(doc, 'p', { textContent: 'This is exactly what will be sent:' }),
    sent,
    asking(doc, port, 'Send', { type: 'send' }, true),
    asking(doc, port, 'Stop allowing in this chat', { type: 'allow-chat', allowed: false }),
  ];
}

/**
 * What catching up reads, said plainly (#106): the chat list holds only
 * each chat's latest message, and the user should know that the summary
 * cannot cover the rest.
 */
const CATCH_UP_NOTE = [
  'From the chat list only: the latest message of each unread chat, not all its unread messages.',
  'No chat is opened or marked as read. This includes chats where the assistant is off.',
].join(' ');

/** The unread chats' preview: what it covers, then exactly what would be sent. */
function catchUpOf(doc: Document, port: Port, news: CatchUp): HTMLElement[] {
  return [
    element(doc, 'p', { textContent: CATCH_UP_NOTE }),
    element(doc, 'p', { textContent: 'This is exactly what will be sent:' }),
    element(doc, 'pre', {
      id: 'preview',
      textContent: `${news.instructions}\n\n${news.transcript}`,
    }),
    asking(doc, port, 'Send', { type: 'send' }, true),
  ];
}

/** The suggested replies, each one a button that puts it in the message box. */
function suggestionsOf(
  doc: Document,
  port: Port,
  items: readonly string[],
  replace: boolean,
): HTMLElement[] {
  const list = element(doc, 'ul', { id: 'suggestions' });
  list.append(
    ...items.map((item, index) => {
      const entry = element(doc, 'li');
      entry.append(asking(doc, port, item, { type: 'use', index }));
      return entry;
    }),
  );
  const lead = replace
    ? 'Use the rewritten draft in place of yours:'
    : 'Pick a reply to put in the message box:';
  return [element(doc, 'p', { textContent: lead }), list];
}

/** How the panel names each rewrite style. */
const STYLES: readonly (readonly [RewriteStyle, string])[] = [
  ['friendlier', 'Friendlier'],
  ['formal', 'More formal'],
  ['shorter', 'Shorter'],
  ['translate', 'Translate'],
];

/** Rewriting the draft (#105): a style, a language for translations, and the button. */
function rewriteForm(doc: Document, port: Port): HTMLElement[] {
  const styleLabel = element(doc, 'label', { htmlFor: 'style', textContent: 'Style' });
  const style = element(doc, 'select', { id: 'style' });
  style.append(
    ...STYLES.map(([value, label]) => element(doc, 'option', { value, textContent: label })),
  );
  const languageLabel = element(doc, 'label', { htmlFor: 'language', textContent: 'Language' });
  const language = element(doc, 'input', { id: 'language', type: 'text', value: 'English' });
  const form = element(doc, 'form', { id: 'rewrite' });
  form.append(
    styleLabel,
    style,
    languageLabel,
    language,
    element(doc, 'button', { type: 'submit', textContent: 'Rewrite my draft', className: PRIMARY }),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    port.postMessage({
      type: 'prepare-rewrite',
      style: style.value as RewriteStyle,
      language: language.value,
    });
  });
  return [element(doc, 'h2', { textContent: 'Rewrite my draft' }), form];
}

/** The replies section: look at the chat, preview, send, pick. */
function repliesSection(doc: Document, port: Port) {
  const output = element(doc, 'div', { id: 'replies' });
  output.setAttribute('aria-live', 'polite');
  const section = element(doc, 'section');
  section.append(
    element(doc, 'h2', { textContent: 'Suggest replies' }),
    asking(doc, port, 'Look at this chat', { type: 'prepare' }, true),
    asking(doc, port, 'Summarize this chat', { type: 'prepare-summary' }),
    asking(doc, port, 'Catch up on unread chats', { type: 'prepare-catch-up' }),
    ...rewriteForm(doc, port),
    output,
  );
  const show = (...nodes: HTMLElement[]): void => {
    output.replaceChildren(...nodes);
  };
  return { section, output, show };
}

/** What each button of the private model's section asks the hidden page. */
const LOCAL_REQUESTS: Readonly<Record<string, PanelRequest>> = {
  download: { type: 'download-model' },
  smaller: { type: 'smaller-model' },
};

/**
 * The private model on this computer (#457): how it stands, the button
 * for the next step, the space it takes with a button to remove it, and
 * its name under Advanced, for those who want to know.
 */
function localSection(doc: Document, port: Port) {
  const section = element(doc, 'section', { id: 'private-model', hidden: true });
  const status = element(doc, 'p', { id: 'private-status' });
  status.setAttribute('aria-live', 'polite');
  const next = element(doc, 'div');
  const used = element(doc, 'p');
  const remove = asking(doc, port, 'Remove model', { type: 'remove-model' });
  const name = element(doc, 'p');
  const advanced = element(doc, 'details');
  advanced.append(element(doc, 'summary', { textContent: 'Advanced' }), name);
  section.append(
    element(doc, 'h2', { textContent: 'Private model on this computer' }),
    status,
    next,
    used,
    remove,
    advanced,
  );
  const show = (view: LocalView): void => {
    section.hidden = view.status === '' && view.used === 0;
    status.textContent = view.status;
    const request = LOCAL_REQUESTS[view.action];
    const button = request === undefined ? [] : [asking(doc, port, view.label, request, true)];
    next.replaceChildren(...button);
    used.textContent = `It uses ${aboutSize(view.used)} on this computer.`;
    used.hidden = view.used === 0;
    remove.hidden = view.used === 0;
    name.textContent = `Model: ${view.model}.`;
  };
  return { section, show };
}

type Handlers = { readonly [T in Update['type']]: (news: Extract<Update, { type: T }>) => void };

/** The panel's sections that show the hidden page's news. */
interface Sections {
  readonly key: ReturnType<typeof keySection>;
  readonly local: ReturnType<typeof localSection>;
  readonly replies: ReturnType<typeof repliesSection>;
}

/** What the panel does with each kind of news from the hidden page. */
function handlersFor(doc: Document, port: Port, { key, local, replies }: Sections): Handlers {
  const say = (text: string) => element(doc, 'p', { textContent: text });
  const progress = say('');
  return {
    state: key.show,
    local: local.show,
    preview: (news) => {
      replies.show(...previewOf(doc, port, news));
    },
    'catch-up': (news) => {
      replies.show(...catchUpOf(doc, port, news));
    },
    progress: (news) => {
      if (!replies.output.contains(progress)) {
        progress.textContent = '';
        replies.show(progress, asking(doc, port, 'Stop', { type: 'cancel' }));
      }
      progress.textContent += news.text;
    },
    suggestions: (news) => {
      replies.show(...suggestionsOf(doc, port, news.items, news.replace));
    },
    summary: (news) => {
      replies.show(
        say('Summary, for you alone; nothing of it goes to the chat:'),
        element(doc, 'pre', { id: 'summary', textContent: news.text }),
      );
    },
    used: () => {
      replies.show(say('It is in the message box. Edit it and send it yourself.'));
    },
    problem: (news) => {
      replies.show(say(problemText(news.reason)));
    },
  };
}

/**
 * The panel: the key for the provider the user chose, and suggested replies
 * for the open chat. It holds no host API; the hidden page does everything
 * it asks, and only after the user saw what would be sent.
 */
export function mountPanel(doc: Document, port: Port): void {
  const key = keySection(doc, port);
  const local = localSection(doc, port);
  const replies = repliesSection(doc, port);
  const handlers = handlersFor(doc, port, { key, local, replies });
  // The hidden page may still be loading, and the channel keeps no message
  // for a page not yet listening, so the panel asks until it hears back.
  const ask = (): void => {
    port.postMessage({ type: 'state?' });
  };
  const retry = setInterval(ask, RETRY_MS);
  port.onmessage = (event) => {
    const news = update(event.data);
    if (news?.type === 'state') {
      clearInterval(retry);
    }
    if (news !== undefined) {
      (handlers[news.type] as (news: Update) => void)(news);
    }
  };
  doc.body.append(
    element(doc, 'h1', { textContent: 'AI assistant' }),
    key.section,
    local.section,
    replies.section,
  );
  ask();
}
