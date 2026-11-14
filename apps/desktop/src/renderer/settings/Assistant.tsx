import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  AssistantView,
  ChromeApi,
  FoundServer,
  KeyedProvider,
  PrivateModelAction,
  SettingsSnapshot,
} from '../../shared/api/chrome-api.ts';
import { localServerOf } from '../../shared/local-server.ts';
import { en } from '../../shared/messages/en.ts';
import { modelsBesideAuto } from '../../shared/model-choices.ts';
import { fieldsOf, Group, Pill, type Change, type Tone } from './Field.tsx';
import { Icon, type IconName } from './icons.tsx';

const text = en.assistant.settings;
const pills = text.pills;

const PROVIDER = 'assistant.provider';

/** Where to get a key, which opens in the user's browser. */
const KEY_PAGES: Readonly<Record<KeyedProvider, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

/** How often the view is read again while the private model downloads. */
const FOLLOW_MS = 1000;

/** The assistant's view, read again on request and while the private model downloads. */
export function useAssistantView(api: ChromeApi): readonly [AssistantView | null, () => void] {
  const [view, setView] = useState<AssistantView | null>(null);
  const load = (): void => {
    api.assistant.view().then(setView, () => undefined);
  };
  useEffect(load, [api]);
  const downloading = view?.privateModel.actions.includes('pause') === true;
  useEffect(() => {
    if (!downloading) {
      return undefined;
    }
    const timer = setInterval(load, FOLLOW_MS);
    return () => {
      clearInterval(timer);
    };
  }, [downloading]);
  return [view, load];
}

interface KeyProps {
  readonly api: ChromeApi;
  readonly provider: KeyedProvider;
  readonly saved: boolean;
  readonly onSaved: () => void;
}

/** What the key's buttons do, and what they say came of it. */
function useKey({ api, provider, onSaved }: KeyProps, onKept: () => void) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState('');
  const save = (): void => {
    if (key.trim() === '') {
      setStatus(text.key.empty);
      return;
    }
    void api.assistant.saveKey(provider, key).then((kept) => {
      setKey('');
      setStatus(kept ? '' : text.key.cannotKeep);
      onKept();
      onSaved();
    });
  };
  const test = (): void => {
    setStatus(text.key.testing);
    void api.assistant.testKey(provider).then((problem) => {
      setStatus(problem === '' ? text.key.works : problem);
    });
  };
  const forget = (): void => {
    setStatus('');
    void api.assistant.forgetKey(provider).then(onSaved);
  };
  return { key, setKey, status, save, test, forget };
}

/** A saved key, which never comes back to the page: dots, and what they stand for. */
function SavedKey({ id }: { readonly id: string }): JSX.Element {
  return (
    <output id={id} class="masked" aria-labelledby={`${id}-label`}>
      <span aria-hidden="true">••••••••••••••••</span>
      <span class="visually-hidden">{text.key.saved}</span>
    </output>
  );
}

function KeyInput(props: {
  readonly id: string;
  readonly value: string;
  readonly onInput: (value: string) => void;
}): JSX.Element {
  return (
    <input
      id={props.id}
      type="password"
      autocomplete="off"
      spellcheck={false}
      placeholder={text.key.placeholder}
      value={props.value}
      onInput={(event) => {
        props.onInput(event.currentTarget.value);
      }}
    />
  );
}

/**
 * A key field for one provider. Once a key is saved, it shows only that one
 * is, with Test, Replace and Remove; the key itself never comes back.
 */
export function KeyField(props: KeyProps): JSX.Element {
  const { provider, saved } = props;
  const [replacing, setReplacing] = useState(false);
  const stopReplacing = useCallback(() => {
    setReplacing(false);
  }, []);
  const { key, setKey, status, save, test, forget } = useKey(props, stopReplacing);
  const id = `assistant-key-${provider}`;
  const editing = !saved || replacing;
  return (
    <div class="key">
      <label id={`${id}-label`} for={id}>
        {text.key.label}
      </label>
      <div class="line">
        {editing ? <KeyInput id={id} value={key} onInput={setKey} /> : <SavedKey id={id} />}
        <KeyActions
          saved={saved}
          editing={editing}
          onSave={save}
          onTest={test}
          onForget={forget}
          onReplace={setReplacing}
        />
      </div>
      <a href={KEY_PAGES[provider]} target="_blank" rel="noreferrer">
        {text[provider].getKey}
      </a>
      <output aria-live="polite">{status}</output>
    </div>
  );
}

interface KeyActionProps {
  readonly saved: boolean;
  readonly editing: boolean;
  readonly onSave: () => void;
  readonly onTest: () => void;
  readonly onForget: () => void;
  readonly onReplace: (replacing: boolean) => void;
}

/** Save, and Cancel while a saved key is being replaced. */
function EditingActions(props: KeyActionProps): JSX.Element {
  return (
    <>
      <button type="button" onClick={props.onSave}>
        {text.key.save}
      </button>
      {props.saved ? (
        <button
          type="button"
          onClick={() => {
            props.onReplace(false);
          }}
        >
          {text.key.cancel}
        </button>
      ) : null}
    </>
  );
}

function KeyActions(props: KeyActionProps): JSX.Element {
  if (props.editing) {
    return <EditingActions {...props} />;
  }
  return (
    <>
      <button type="button" onClick={props.onTest}>
        {text.key.test}
      </button>
      <button
        type="button"
        onClick={() => {
          props.onReplace(true);
        }}
      >
        {text.key.replace}
      </button>
      <button type="button" onClick={props.onForget}>
        {text.key.forget}
      </button>
    </>
  );
}

const ACTION_LABELS: Readonly<Record<PrivateModelAction, string>> = {
  download: text.private.download,
  pause: text.private.pause,
  resume: text.private.resume,
  remove: text.private.remove,
  smaller: text.private.smaller,
};

interface PlaceProps {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly view: AssistantView;
  readonly onChange: Change;
  readonly reload: () => void;
  /** The model list, shown under the chosen provider once it answers. */
  readonly model: JSX.Element | null;
}

interface PillOf {
  readonly tone: Tone;
  readonly label: string;
}

interface PlaceHeadProps {
  readonly value: string;
  readonly title: string;
  readonly description: string;
  readonly pill: PillOf;
  readonly chosen: boolean;
  readonly onChange: Change;
}

/** A provider's radio button, name, description and status; the whole head picks it. */
function PlaceHead(props: PlaceHeadProps): JSX.Element {
  const { value } = props;
  const id = `provider-${value}`;
  return (
    <div class="provider-head">
      <input
        id={id}
        type="radio"
        name={PROVIDER}
        value={value}
        checked={props.chosen}
        aria-describedby={`${id}-hint ${id}-pill`}
        onChange={() => {
          props.onChange(PROVIDER, value);
        }}
      />
      <div class="row-text">
        <label class="row-label" for={id}>
          {props.title}
        </label>
        <p id={`${id}-hint`} class="hint">
          {props.description}
        </p>
      </div>
      <span id={`${id}-pill`}>
        <Pill tone={props.pill.tone} label={props.pill.label} />
      </span>
    </div>
  );
}

/**
 * One provider, chosen with its radio button. Only the chosen one shows
 * what it needs, so the list stays short.
 */
function Place(
  props: Omit<PlaceHeadProps, 'chosen'> & {
    readonly snapshot: SettingsSnapshot;
    readonly children?: ComponentChildren;
  },
): JSX.Element {
  const chosen = props.snapshot.values[PROVIDER] === props.value;
  const open = chosen && props.children !== undefined;
  return (
    <div class={chosen ? 'provider chosen' : 'provider'}>
      <PlaceHead {...props} chosen={chosen} />
      {open ? <div class="provider-panel">{props.children}</div> : null}
    </div>
  );
}

/** How far the private model is, from what can be done with it next. */
function privatePill(actions: readonly PrivateModelAction[]): PillOf {
  if (actions.includes('pause')) {
    return { tone: 'accent', label: pills.downloading };
  }
  if (actions.includes('resume')) {
    return { tone: 'neutral', label: pills.paused };
  }
  if (actions.includes('smaller')) {
    return { tone: 'warning', label: pills.tooLarge };
  }
  return actions.includes('download')
    ? { tone: 'neutral', label: pills.notDownloaded }
    : { tone: 'success', label: pills.ready };
}

function PrivatePlace(props: PlaceProps): JSX.Element {
  const { api, view, reload } = props;
  const model = view.privateModel;
  return (
    <Place
      {...props}
      value="built-in"
      title={text.private.title}
      description={text.private.description({ size: model.size })}
      pill={privatePill(model.actions)}
    >
      <output aria-live="polite">{model.status}</output>
      <div class="actions">
        {model.actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => {
              void api.assistant.privateModel(action).then(reload);
            }}
          >
            {ACTION_LABELS[action]}
          </button>
        ))}
      </div>
      {props.model}
    </Place>
  );
}

function KeyedPlace(props: PlaceProps & { readonly provider: KeyedProvider }): JSX.Element {
  const { api, view, provider, reload } = props;
  const saved = view.keys[provider];
  return (
    <Place
      {...props}
      value={provider}
      title={text[provider].title}
      description={text[provider].description}
      pill={
        saved
          ? { tone: 'success', label: pills.keySaved }
          : { tone: 'warning', label: pills.needsKey }
      }
    >
      <KeyField api={api} provider={provider} saved={saved} onSaved={reload} />
      {props.model}
    </Place>
  );
}

/** Switches to a server on this computer: its address, then the provider. */
const chooseServer = (onChange: Change, endpoint: string): void => {
  onChange('assistant.localServer', endpoint);
  onChange(PROVIDER, 'local');
};

function ServerList(props: {
  readonly servers: readonly FoundServer[] | null;
  readonly onChange: Change;
}): JSX.Element | null {
  const { servers, onChange } = props;
  if (servers === null) {
    return null;
  }
  if (servers.length === 0) {
    return <p class="hint">{text.local.none}</p>;
  }
  return (
    <ul class="servers">
      {servers.map(({ server, endpoint, models }) => (
        <li key={endpoint}>
          <span>
            {text.local.found({
              server,
              models: models.length === 0 ? text.local.noModels : models.join(', '),
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              chooseServer(onChange, endpoint);
            }}
          >
            {text.local.use}
          </button>
        </li>
      ))}
    </ul>
  );
}

function LocalAddress(props: { readonly onChange: Change }): JSX.Element {
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState('');
  return (
    <div class="key">
      <label for="assistant-address">{text.local.address}</label>
      <div class="line">
        <input
          id="assistant-address"
          type="text"
          spellcheck={false}
          placeholder={text.local.addressPlaceholder}
          value={typed}
          onInput={(event) => {
            setTyped(event.currentTarget.value);
          }}
        />
        <button
          type="button"
          onClick={() => {
            const endpoint = localServerOf(typed);
            setProblem(endpoint === undefined ? text.local.badAddress : '');
            if (endpoint !== undefined) {
              chooseServer(props.onChange, endpoint);
            }
          }}
        >
          {text.local.saveAddress}
        </button>
      </div>
      <output aria-live="polite">{problem}</output>
    </div>
  );
}

function FindServers(props: PlaceProps): JSX.Element {
  const { api, onChange } = props;
  const [servers, setServers] = useState<readonly FoundServer[] | null>(null);
  const [finding, setFinding] = useState(false);
  return (
    <>
      <div class="actions">
        <button
          type="button"
          disabled={finding}
          onClick={() => {
            setFinding(true);
            void api.assistant.findServers().then((found) => {
              setServers(found);
              setFinding(false);
            });
          }}
        >
          {finding ? text.local.finding : text.local.find}
        </button>
      </div>
      <ServerList servers={servers} onChange={onChange} />
    </>
  );
}

function LocalPlace(props: PlaceProps): JSX.Element {
  const current = String(props.snapshot.values['assistant.localServer']);
  return (
    <Place
      {...props}
      value="local"
      title={text.local.title}
      description={text.local.description}
      pill={
        current === ''
          ? { tone: 'neutral', label: pills.notSetUp }
          : { tone: 'success', label: pills.addressSaved }
      }
    >
      {current === '' ? null : <p>{text.local.current({ server: current })}</p>}
      <FindServers {...props} />
      <LocalAddress onChange={props.onChange} />
      {props.model}
    </Place>
  );
}

function AutomaticPlace(props: PlaceProps): JSX.Element {
  const ready = props.view.inUse !== null;
  return (
    <Place
      {...props}
      value="auto"
      title={text.automatic}
      description={text.automaticHint}
      pill={
        ready
          ? { tone: 'success', label: pills.ready }
          : { tone: 'neutral', label: pills.nothingSetUp }
      }
    >
      {props.model ?? undefined}
    </Place>
  );
}

/** Who gets the open chat's messages, in one sentence that follows the provider. */
function privacyNote(view: AssistantView, snapshot: SettingsSnapshot): string {
  const sent = text.privacy.sent;
  switch (view.inUse) {
    case null:
      return sent.none;
    case 'anthropic':
    case 'openai':
      return sent.away({
        messages: String(snapshot.values['assistant.messages']),
        company: text[view.inUse].company,
      });
    default:
      return sent.here;
  }
}

function Places(props: PlaceProps): JSX.Element {
  return (
    <div class="group-section">
      <h2 id="provider-group" class="group-title">
        {text.where}
      </h2>
      <p class="group-hint">{text.whereHint}</p>
      <fieldset class="group providers" aria-labelledby="provider-group">
        <AutomaticPlace {...props} />
        <PrivatePlace {...props} />
        <KeyedPlace {...props} provider="anthropic" />
        <KeyedPlace {...props} provider="openai" />
        <LocalPlace {...props} />
      </fieldset>
      <p class="group-note with-icon">
        <Icon name="lock" />
        {privacyNote(props.view, props.snapshot)}
      </p>
    </div>
  );
}

/** Auto, which names the model it picks, or one of the provider's models. */
function ModelChoice(props: {
  readonly snapshot: SettingsSnapshot;
  readonly view: AssistantView;
  readonly onChange: Change;
}): JSX.Element {
  const { snapshot, view, onChange } = props;
  const picked = String(snapshot.values['assistant.model']);
  const listed = view.models.some(({ id }) => id === picked);
  const auto =
    view.auto === null ? text.model.auto : text.model.autoNamed({ model: view.auto.label });
  return (
    <div class="key">
      <label for="assistant-model">{en.settings.fields.assistant.model.label}</label>
      <select
        id="assistant-model"
        value={listed ? picked : 'auto'}
        aria-describedby="assistant-model-hint"
        onChange={(event) => {
          onChange('assistant.model', event.currentTarget.value);
        }}
      >
        <option value="auto">{auto}</option>
        {modelsBesideAuto(view.models, view.auto, picked).map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <p id="assistant-model-hint" class="hint">
        {en.settings.fields.assistant.model.description}
      </p>
    </div>
  );
}

/** The chats the assistant may read, by account, each with Remove. */
function Chats(props: {
  readonly api: ChromeApi;
  readonly view: AssistantView;
  readonly reload: () => void;
}): JSX.Element[] {
  const { api, view, reload } = props;
  return view.chats.flatMap(({ account, accountName, chats }) =>
    chats.map(({ id, name }) => (
      <div class="row" key={`${account}/${id}`}>
        <span class="row-label">
          {text.privacy.chat({ account: accountName, chat: name ?? text.privacy.unnamed })}
        </span>
        <button
          type="button"
          aria-label={text.privacy.removeLabel({ chat: name ?? text.privacy.unnamed })}
          onClick={() => {
            void api.assistant.forgetChat(account, id).then(reload);
          }}
        >
          {text.privacy.remove}
        </button>
      </div>
    )),
  );
}

/** Adds the chat open in WhatsApp to the list, saying so when none is open. */
function AddOpenChat(props: {
  readonly api: ChromeApi;
  readonly view: AssistantView;
  readonly reload: () => void;
}) {
  const { api, view, reload } = props;
  const [status, setStatus] = useState('');
  return (
    <div class="row">
      <div class="row-text">
        <p class="hint">{view.chats.length === 0 ? text.privacy.noChats : text.privacy.listed}</p>
        <output aria-live="polite" class="hint">
          {status}
        </output>
      </div>
      <button
        type="button"
        onClick={() => {
          void api.assistant.allowOpenChat().then((added) => {
            setStatus(added ? '' : text.privacy.noOpenChat);
            reload();
          });
        }}
      >
        {text.privacy.addOpenChat}
      </button>
    </div>
  );
}

function ChatsGroup(props: PlaceProps) {
  const { snapshot, onChange } = props;
  return (
    <Group id="assistant-chats" title={text.groups.chats}>
      {fieldsOf(['assistant.chats'], snapshot, onChange)}
      {snapshot.values['assistant.chats'] === 'all' ? null : (
        <>
          <Chats {...props} />
          <AddOpenChat {...props} />
        </>
      )}
    </Group>
  );
}

const NOTICE_ICONS: Readonly<Record<'info' | 'warning' | 'success', IconName>> = {
  info: 'info',
  warning: 'alert',
  success: 'check',
};

/** The one line that says whether the assistant can answer, and if not, what it needs. */
function StatusLine({ view }: { readonly view: AssistantView }): JSX.Element {
  const [kind, words] = (() => {
    if (view.inUse === null) {
      return ['info', text.notSetUp] as const;
    }
    if (view.status !== '') {
      return ['warning', view.status] as const;
    }
    return [
      'success',
      text.ready({ provider: en.settings.fields.assistant.provider.options[view.inUse] }),
    ] as const;
  })();
  return (
    <p class={`status-line ${kind}`}>
      <Icon name={NOTICE_ICONS[kind]} />
      <output>{words}</output>
    </p>
  );
}

/**
 * Settings › Assistant (ADR 0017), the one place to set the assistant up:
 * whether it shows, where it runs, how it suggests, and the chats it works in.
 */
export function AssistantSection(props: {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element {
  const { api, snapshot, onChange } = props;
  const [view, reload] = useAssistantView(api);
  const change = useCallback<Change>(
    (id, value) => {
      onChange(id, value);
      setTimeout(reload, 0);
    },
    [onChange, reload],
  );
  return (
    <div class="assistant" aria-busy={view === null}>
      {view === null ? null : <StatusLine view={view} />}
      <Group id="assistant-in-chats" title={text.groups.inChats}>
        {fieldsOf(['assistant.enabled'], snapshot, onChange)}
      </Group>
      {view === null ? (
        <p>{en.common.loading}</p>
      ) : (
        <AssistantDetails
          api={api}
          snapshot={snapshot}
          view={view}
          onChange={change}
          reload={reload}
        />
      )}
    </div>
  );
}

function AssistantDetails(props: Omit<PlaceProps, 'model'>) {
  const { view, snapshot, onChange } = props;
  const model = view.models.length === 0 ? null : <ModelChoice {...props} />;
  return (
    <>
      <Places {...props} model={model} />
      <Group id="assistant-replies" title={text.groups.replies}>
        {fieldsOf(['assistant.autoSuggest', 'assistant.messages'], snapshot, onChange)}
      </Group>
      <ChatsGroup {...props} model={model} />
    </>
  );
}
