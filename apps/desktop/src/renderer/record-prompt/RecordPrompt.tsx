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

/**
 * The consent warning (ADR 0015), shown until the user confirms it: they
 * confirm only by ticking that they know the law and will ask.
 */
function ConsentWarning(props: {
  readonly ticked: boolean;
  readonly onTick: (ticked: boolean) => void;
}): JSX.Element {
  return (
    <section class="consent-warning" aria-labelledby="consent-title">
      <h2 id="consent-title" class="consent-title">
        {text.consent.message}
      </h2>
      <p>{text.consent.detail}</p>
      <div class="field">
        <input
          id="consent"
          type="checkbox"
          checked={props.ticked}
          onChange={(event) => {
            props.onTick(event.currentTarget.checked);
          }}
        />
        <label htmlFor="consent">{text.consent.checkbox}</label>
      </div>
    </section>
  );
}

function Asking({
  api,
  state,
}: {
  readonly api: ChromeApi;
  readonly state: RecordPromptState;
}): JSX.Element {
  const [ticked, setTicked] = useState(false);
  return (
    <>
      <p>{text.asks({ extension: state.extension })}</p>
      <p class="hint">{text.consentHint}</p>
      {state.consent ? <ConsentWarning ticked={ticked} onTick={setTicked} /> : null}
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            void api.recordPrompt.answer(false, false);
          }}
        >
          {text.notNow}
        </button>
        <button
          type="button"
          class="primary"
          disabled={state.consent && !ticked}
          onClick={() => {
            void api.recordPrompt.answer(true, ticked);
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
      {state.phase === 'asking' ? <Asking api={api} state={state} /> : null}
      {state.phase === 'recording' && state.since !== null ? (
        <Recording api={api} since={state.since} />
      ) : null}
      {state.phase === 'ended' ? <output>{text.saved}</output> : null}
    </main>
  );
}
