import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AssistantBarState, ChromeApi } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.assistantBar;

/** The latest state: pushed by YapYap, or asked for once in case a push came before the page. */
function useAssistantBarState(api: ChromeApi): AssistantBarState | null {
  const [state, setState] = useState<AssistantBarState | null>(null);
  useEffect(() => {
    api.assistantBar.onState(setState);
    api.assistantBar
      .state()
      .then((first) => {
        setState((current) => current ?? first);
      })
      .catch(() => undefined);
  }, [api]);
  return state;
}

/** A paper plane, drawn rather than written, so it reads in every language. */
function SendIcon(): JSX.Element {
  return (
    <svg class="send-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8l12-6-4 12-2-5z" fill="currentColor" />
    </svg>
  );
}

/** One suggestion: the text puts it in the message box; the arrow sends it, on this click only. */
function Suggestion(props: {
  readonly api: ChromeApi;
  readonly index: number;
  readonly suggestion: string;
}): JSX.Element {
  const { api, index, suggestion } = props;
  return (
    <li class="suggestion">
      <button
        type="button"
        class="bar-button use"
        title={text.use}
        onClick={() => {
          void api.assistantBar.use(index);
        }}
      >
        {suggestion}
      </button>
      <button
        type="button"
        class="bar-button send"
        aria-label={text.sendLabel}
        title={text.sendLabel}
        onClick={() => {
          void api.assistantBar.send(index);
        }}
      >
        <SendIcon />
      </button>
    </li>
  );
}

/** The field to ask for a message in one's own words; Enter asks, and clears it. */
function Write({ api, busy }: { readonly api: ChromeApi; readonly busy: boolean }): JSX.Element {
  const [draft, setDraft] = useState('');
  return (
    <form
      class="write"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() !== '') {
          void api.assistantBar.prompt(draft);
          setDraft('');
        }
      }}
    >
      <input
        class="bar-input"
        type="text"
        aria-label={text.write}
        placeholder={text.writePlaceholder}
        value={draft}
        disabled={busy}
        maxLength={2000}
        onInput={(event) => {
          setDraft(event.currentTarget.value);
        }}
      />
    </form>
  );
}

/** Whose suggestions these are, the button that asks for them, and what the extension says. */
function Header(props: {
  readonly api: ChromeApi;
  readonly state: AssistantBarState;
}): JSX.Element {
  const { api, state } = props;
  return (
    <div class="row">
      <span class="from">{text.from({ extension: state.extension })}</span>
      <button
        type="button"
        class="bar-button primary suggest"
        disabled={state.working}
        onClick={() => {
          void api.assistantBar.suggest();
        }}
      >
        {text.suggest}
      </button>
      <output class="status">{state.status}</output>
      {state.confirm === undefined ? null : (
        <button
          type="button"
          class="bar-button confirm"
          onClick={() => {
            void api.assistantBar.confirm();
          }}
        >
          {state.confirm}
        </button>
      )}
    </div>
  );
}

/**
 * The assistant bar beneath the open chat (ADR 0013): an extension's
 * suggestions as plain text, and buttons that act only on the user's click.
 */
export function AssistantBar({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const state = useAssistantBarState(api);
  if (state === null || state.extension === '') {
    return null;
  }
  return (
    <section class="bar" aria-label={text.label}>
      <Header api={api} state={state} />
      {state.suggestions.length === 0 ? null : (
        <ul class="suggestions">
          {state.suggestions.map((suggestion, index) => (
            <Suggestion key={suggestion} api={api} index={index} suggestion={suggestion} />
          ))}
        </ul>
      )}
      <Write api={api} busy={state.working} />
    </section>
  );
}
