import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  AssistantView,
  ChromeApi,
  FoundServer,
  KeyedProvider,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { KeyField, useAssistantView } from '../settings/Assistant.tsx';
import type { Change } from '../settings/Field.tsx';

const text = en.assistant.welcome;

/** What the user picked: a key to paste for a service, or done. */
type Picked = KeyedProvider | 'done' | undefined;

/** The first model server found on this computer that serves a model, if any. */
function useFoundServer(api: ChromeApi): FoundServer | undefined {
  const [server, setServer] = useState<FoundServer | undefined>(undefined);
  useEffect(() => {
    api.assistant.findServers().then(
      (found) => {
        setServer(found.find(({ models }) => models.length > 0));
      },
      () => undefined,
    );
  }, [api]);
  return server;
}

/** One choice, which says what it is when picked. */
function Option(props: {
  readonly value: string;
  readonly label: string;
  readonly hint: string;
  readonly onPick: (value: string) => void;
}): JSX.Element {
  return (
    <div class="option row stacked">
      <button
        type="button"
        onClick={() => {
          props.onPick(props.value);
        }}
      >
        {props.label}
      </button>
      <p class="hint">{props.hint}</p>
    </div>
  );
}

interface StepProps {
  readonly api: ChromeApi;
  readonly view: AssistantView;
  readonly onChange: Change;
  readonly choose: (provider: string, then?: Picked) => void;
  readonly setPicked: (picked: Picked) => void;
}

/** What each choice does: a server found on this computer now, a key to paste, or nothing yet. */
function usePick({ onChange, choose, setPicked }: StepProps, server: FoundServer | undefined) {
  return useCallback(
    (value: string) => {
      if (value === 'server' && server !== undefined) {
        onChange('assistant.server', server.endpoint);
        choose('server');
      } else if (value === 'anthropic' || value === 'openai') {
        choose(value, value);
      } else {
        setPicked('done');
      }
    },
    [onChange, choose, setPicked, server],
  );
}

/** Where the assistant can run, a server found on this computer first. */
function Options(props: StepProps): JSX.Element {
  const server = useFoundServer(props.api);
  const pick = usePick(props, server);
  return (
    <div class="group options">
      {server === undefined ? null : (
        <Option
          value="server"
          label={text.local({ server: server.server })}
          hint={text.localHint}
          onPick={pick}
        />
      )}
      {(['anthropic', 'openai'] as const).map((provider) => (
        <Option
          key={provider}
          value={provider}
          label={text[provider]}
          hint={text.keyHint}
          onPick={pick}
        />
      ))}
      <Option value="later" label={text.later} hint={text.laterHint} onPick={pick} />
    </div>
  );
}

/**
 * The first launch's assistant step (ADR 0017): a model server already on
 * this computer when one answers, Claude or OpenAI with a key, or later. Each choice saves at once, as in Settings.
 */
export function AssistantStep(props: {
  readonly api: ChromeApi;
  readonly onChange: Change;
}): JSX.Element | null {
  const { api, onChange } = props;
  const [view, reload] = useAssistantView(api);
  const [picked, setPicked] = useState<Picked>(undefined);
  const choose = useCallback(
    (provider: string, then: Picked = 'done'): void => {
      onChange('assistant.provider', provider);
      setPicked(then);
    },
    [onChange],
  );
  if (view === null) {
    return null;
  }
  return (
    <section aria-labelledby="welcome-assistant">
      <h2 id="welcome-assistant">{text.title}</h2>
      <p class="hint">{text.intro}</p>
      <Options api={api} view={view} onChange={onChange} choose={choose} setPicked={setPicked} />
      {picked === 'anthropic' || picked === 'openai' ? (
        <KeyField api={api} provider={picked} saved={view.keys[picked]} onSaved={reload} />
      ) : null}
      <output aria-live="polite">{picked === 'done' ? text.done : ''}</output>
    </section>
  );
}
