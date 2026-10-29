import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, RecordPromptState } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.recording;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** Minutes and seconds since `since`, or hours too once past the first. */
export function elapsed(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const parts = [
    Math.floor(seconds / SECONDS_PER_HOUR),
    Math.floor(seconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE,
    seconds % SECONDS_PER_MINUTE,
  ];
  const shown = parts[0] === 0 ? parts.slice(1) : parts;
  return shown
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join(':');
}

/** The prompt's state as the main process tells it. */
function usePromptState(api: ChromeApi): RecordPromptState | null {
  const [state, setState] = useState<RecordPromptState | null>(null);
  useEffect(() => {
    api.recordPrompt.state().then(setState, () => undefined);
    api.recordPrompt.onState(setState);
  }, [api]);
  return state;
}

/** The current time, ticking every second while the component shows. */
function useClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

function Asking({
  api,
  extension,
}: {
  readonly api: ChromeApi;
  readonly extension: string;
}): JSX.Element {
  return (
    <>
      <p>{text.asks({ extension })}</p>
      <p class="hint">{text.consentHint}</p>
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            void api.recordPrompt.answer(false);
          }}
        >
          {text.notNow}
        </button>
        <button
          type="button"
          class="primary"
          onClick={() => {
            void api.recordPrompt.answer(true);
          }}
        >
          {text.record}
        </button>
      </div>
    </>
  );
}

function Recording({
  api,
  since,
}: {
  readonly api: ChromeApi;
  readonly since: string;
}): JSX.Element {
  const now = useClock();
  return (
    <>
      <output class="recording">
        <span class="dot" aria-hidden="true" />
        <span>{text.recording}</span> <time>{elapsed(since, now)}</time>
      </output>
      <button
        type="button"
        class="primary"
        onClick={() => {
          void api.recordPrompt.stop();
        }}
      >
        {text.stop}
      </button>
    </>
  );
}

/**
 * YapYap's own window by a call (ADR 0015): it says which extension wants to
 * record, records only on **Record**, and while recording shows a red mark,
 * the time, and **Stop recording**.
 */
export function RecordPrompt({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const state = usePromptState(api);
  if (state === null) {
    return null;
  }
  return (
    <main class="record-prompt">
      <h1>{text.windowTitle}</h1>
      {state.phase === 'asking' ? <Asking api={api} extension={state.extension} /> : null}
      {state.phase === 'recording' && state.since !== null ? (
        <Recording api={api} since={state.since} />
      ) : null}
      {state.phase === 'ended' ? <output>{text.saved}</output> : null}
    </main>
  );
}
