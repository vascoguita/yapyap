import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  AssistantView,
  ChromeApi,
  FoundServer,
  KeyedProvider,
  SettingsSnapshot,
} from '../../shared/api/chrome-api.ts';
import { isModelServer, isOnThisComputer, modelServerOf } from '../../shared/model-server.ts';
import { en } from '../../shared/messages/en.ts';
import { modelsBesideAuto } from '../../shared/model-choices.ts';
import { fieldsOf, Group, Pill, type Change, type Tone } from './Field.tsx';
import { Icon, type IconName } from './icons.tsx';

const text = en.assistant.settings;
const pills = text.pills;

const PROVIDER = 'assistant.provider';

/** Where to get a key for a service, which opens in the user's browser; a server says itself. */
const KEY_PAGES: Readonly<Partial<Record<KeyedProvider, { url: string; label: string }>>> = {
  anthropic: { url: 'https://console.anthropic.com/settings/keys', label: text.anthropic.getKey },
  openai: { url: 'https://platform.openai.com/api-keys', label: text.openai.getKey },
};

/** The assistant's view, read again on request. */
export function useAssistantView(api: ChromeApi): readonly [AssistantView | null, () => void] {
  const [view, setView] = useState<AssistantView | null>(null);
  const load = (): void => {
    api.assistant.view().then(setView, () => undefined);
  };
  useEffect(load, [api]);
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
  const page = KEY_PAGES[provider];
  return (
    <div class="key">
      <label id={`${id}-label`} for={id}>
        {page === undefined ? text.server.keyLabel : text.key.label}
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
      {page === undefined ? (
        <p class="hint">{text.server.keyHint}</p>
      ) : (
        <a href={page.url} target="_blank" rel="noreferrer">
          {page.label}
        </a>
      )}
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

function KeyedPlace(
  props: PlaceProps & { readonly provider: 'anthropic' | 'openai' },
): JSX.Element {
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

/** Switches to a model server: its address, then the provider. */
const chooseServer = (onChange: Change, endpoint: string): void => {
  onChange('assistant.server', endpoint);
  onChange(PROVIDER, 'server');
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
    return <p class="hint">{text.server.none}</p>;
  }
  return (
    <ul class="servers">
      {servers.map(({ server, endpoint, models }) => (
        <li key={endpoint}>
          <span>
            {text.server.found({
              server,
              models: models.length === 0 ? text.server.noModels : models.join(', '),
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              chooseServer(onChange, endpoint);
            }}
          >
            {text.server.use}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The server's address, typed: on this computer, the home network or the internet (#627). */
function ServerAddress(props: { readonly onChange: Change }): JSX.Element {
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState('');
  return (
    <div class="key">
      <label for="assistant-address">{text.server.address}</label>
      <div class="line">
        <input
          id="assistant-address"
          type="text"
          spellcheck={false}
          placeholder={text.server.addressPlaceholder}
          value={typed}
          onInput={(event) => {
            setTyped(event.currentTarget.value);
          }}
        />
        <button
          type="button"
          onClick={() => {
            const endpoint = modelServerOf(typed);
            setProblem(endpoint === undefined ? text.server.badAddress : '');
            if (endpoint !== undefined) {
              chooseServer(props.onChange, endpoint);
            }
          }}
        >
          {text.server.saveAddress}
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
          {finding ? text.server.finding : text.server.find}
        </button>
      </div>
      <ServerList servers={servers} onChange={onChange} />
    </>
  );
}

function ServerPlace(props: PlaceProps): JSX.Element {
  const { api, view, reload } = props;
  const current = String(props.snapshot.values['assistant.server']);
  return (
    <Place
      {...props}
      value="server"
      title={text.server.title}
      description={text.server.description}
      pill={
        current === ''
          ? { tone: 'neutral', label: pills.notSetUp }
          : { tone: 'success', label: pills.addressSaved }
      }
    >
      {current === '' ? null : <p>{text.server.current({ server: current })}</p>}
      <FindServers {...props} />
      <ServerAddress onChange={props.onChange} />
      <KeyField api={api} provider="server" saved={view.keys.server} onSaved={reload} />
      {props.model}
    </Place>
  );
}

/** Who gets what is sent: the company, or the server's address, which the user named. */
function recipientOf(inUse: NonNullable<AssistantView['inUse']>, server: string): string {
  return inUse === 'server' ? new URL(server).host : text[inUse].company;
}

/** Who gets the open chat's messages, in one sentence that follows the provider. */
function privacyNote(view: AssistantView, snapshot: SettingsSnapshot): string {
  const sent = text.privacy.sent;
  const server = String(snapshot.values['assistant.server']);
  // A server chosen before it has an address sends nothing yet.
  if (view.inUse === null || (view.inUse === 'server' && !isModelServer(server))) {
    return sent.none;
  }
  if (view.inUse === 'server' && isOnThisComputer(server)) {
    return sent.here;
  }
  return sent.away({
    messages: String(snapshot.values['assistant.messages']),
    company: recipientOf(view.inUse, server),
  });
}

function Places(props: PlaceProps): JSX.Element {
  return (
    <div class="group-section">
      <h2 id="provider-group" class="group-title">
        {text.where}
      </h2>
      <p class="group-hint">{text.whereHint}</p>
      <fieldset class="group providers" aria-labelledby="provider-group">
        <KeyedPlace {...props} provider="anthropic" />
        <KeyedPlace {...props} provider="openai" />
        <ServerPlace {...props} />
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
