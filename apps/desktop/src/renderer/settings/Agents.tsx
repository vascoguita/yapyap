import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AgentsView, AgentTokenView } from '../../shared/api/agents-api.ts';
import type { ChromeApi, SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { AgentTokenForm, chatLabel, CreatedToken, type Created } from './AgentTokenForm.tsx';
import { fieldsOf, Group, type Change } from './Field.tsx';

const text = en.agents;

/** How often the view is read again while the section is open, for new activity. */
const FOLLOW_MS = 2000;

/** The agents' view, read again on request and every few seconds while the server is on. */
function useAgentsView(api: ChromeApi, on: boolean): readonly [AgentsView | null, () => void] {
  const [view, setView] = useState<AgentsView | null>(null);
  const load = useCallback((): void => {
    api.agents.view().then(setView, () => undefined);
  }, [api]);
  useEffect(load, [load, on]);
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    const timer = setInterval(load, FOLLOW_MS);
    return () => {
      clearInterval(timer);
    };
  }, [on, load]);
  return [view, load];
}

const when = (time: number): string => new Date(time).toLocaleString();

/** Where agents connect, once the server listens; or why it cannot, with a way out. */
function Address(props: { readonly api: ChromeApi; readonly view: AgentsView }) {
  const { api, view } = props;
  if (view.address !== null) {
    const address = view.address;
    return (
      <div class="row">
        <div class="row-text">
          <span class="row-label">{text.address}</span>
          <p class="hint">{text.addressHint}</p>
        </div>
        <div class="row-control">
          <code class="address">{address}</code>
          <button type="button" onClick={() => void api.agents.copy(address)}>
            {text.copy}
          </button>
        </div>
      </div>
    );
  }
  if (view.problem !== '') {
    return (
      <div class="row">
        <output class="row-text problem">{view.problem}</output>
        <button type="button" onClick={() => void api.agents.newPort()}>
          {text.newPort}
        </button>
      </div>
    );
  }
  return (
    <p class="row hint" aria-busy="true">
      {en.common.loading}
    </p>
  );
}

/** What a token's limits allow, in words. */
function limitsOf(token: AgentTokenView): string {
  const limit = (value: number | null): string =>
    value === null ? text.tokens.unlimited : String(value);
  const calls = text.tokens.limits({ calls: limit(token.limits.callsPerMinute) });
  if (!token.scopes.includes('messages:send')) {
    return calls;
  }
  const sends = text.tokens.sendLimits({
    minute: limit(token.limits.sendsPerMinute),
    day: limit(token.limits.sendsPerDay),
  });
  return `${calls}; ${sends}`;
}

function expiryOf(token: AgentTokenView, now: number): string {
  if (token.expires === null) {
    return text.tokens.neverExpires;
  }
  return token.expires <= now
    ? text.tokens.expired
    : text.tokens.expires({ date: when(token.expires) });
}

interface TokenProps {
  readonly api: ChromeApi;
  readonly token: AgentTokenView;
  readonly accounts: AgentsView['accounts'];
  readonly reload: () => void;
}

/** A removable item of a token: taking one away narrows it, and can never widen it. */
function Removable(props: {
  readonly label: string;
  readonly danger?: boolean;
  readonly onRemove: () => void;
}): JSX.Element {
  return (
    <li class={props.danger === true ? 'chip danger' : 'chip'}>
      {props.label}{' '}
      <button
        type="button"
        aria-label={text.tokens.remove({ item: props.label })}
        onClick={props.onRemove}
      >
        {text.tokens.removeMark}
      </button>
    </li>
  );
}

function TokenScopes({ api, token, accounts, reload }: TokenProps): JSX.Element {
  const narrow = (step: Parameters<ChromeApi['agents']['narrow']>[1]) => () => {
    void api.agents.narrow(token.id, step).then(reload);
  };
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  return (
    <ul class="chips">
      {token.scopes.map((scope) => (
        <Removable
          key={scope}
          label={text.scopes[scope]}
          danger={scope === 'messages:send'}
          onRemove={narrow({ scope })}
        />
      ))}
      {token.accounts.map((account) => (
        <Removable
          key={account}
          label={names.get(account) ?? account}
          onRemove={narrow({ account })}
        />
      ))}
      {token.chats === 'all' ? (
        <li class="chip">{text.tokens.allChats}</li>
      ) : (
        token.chats.map((chat) => (
          <Removable
            key={chat.id}
            label={chatLabel(chat) || text.tokens.unnamedChat}
            onRemove={narrow({ chat: chat.id })}
          />
        ))
      )}
    </ul>
  );
}

function Token(props: TokenProps): JSX.Element {
  const { api, token, reload } = props;
  const now = Date.now();
  return (
    <li class="row token">
      <div class="row-text">
        <h3 class="row-label">{token.name}</h3>
        <p class="hint">
          {limitsOf(token)} · {expiryOf(token, now)} ·{' '}
          {token.lastUsed === null
            ? text.tokens.neverUsed
            : text.tokens.lastUsed({ date: when(token.lastUsed) })}
        </p>
        <TokenScopes {...props} />
      </div>
      <div class="row-control">
        <button type="button" onClick={() => void api.agents.revoke(token.id).then(reload)}>
          {text.tokens.revoke}
        </button>
      </div>
    </li>
  );
}

function Activity({ view }: { readonly view: AgentsView }): JSX.Element {
  const title = text.activity.title;
  return (
    <div class="group-section">
      <h2 class="group-title">{title}</h2>
      {view.activity.length === 0 ? (
        <p class="group-note">{text.activity.none}</p>
      ) : (
        <ul class="group activity" aria-label={title}>
          {view.activity.map((entry, index) => (
            <li class="row" key={`${String(entry.time)}-${String(index)}`}>
              {text.activity.entry({ ...entry, time: when(entry.time) })}
            </li>
          ))}
        </ul>
      )}
      <p class="group-note">{text.activity.note}</p>
    </div>
  );
}

/** Whether the form for a new token shows, and the token it just made, shown once. */
function useNewToken(reload: () => void) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const show = useCallback(
    (next: Created): void => {
      setCreating(false);
      setCreated(next);
      reload();
    },
    [reload],
  );
  const cancel = useCallback((): void => {
    setCreating(false);
  }, []);
  const done = useCallback((): void => {
    setCreated(null);
  }, []);
  return { creating, setCreating, created, show, cancel, done };
}

/** Creating a token, then showing it once; the list of tokens, each with Revoke. */
function Tokens(props: {
  readonly api: ChromeApi;
  readonly view: AgentsView;
  readonly reload: () => void;
}): JSX.Element {
  const { api, view, reload } = props;
  const { creating, setCreating, created, show, cancel, done } = useNewToken(reload);
  return (
    <div class="group-section">
      <div class="group-head">
        <h2 class="group-title">{text.tokens.title}</h2>
        {creating ? null : (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            {text.tokens.create}
          </button>
        )}
      </div>
      {created === null ? null : <CreatedToken api={api} created={created} onDone={done} />}
      {creating ? (
        <AgentTokenForm api={api} accounts={view.accounts} onCreated={show} onCancel={cancel} />
      ) : null}
      <TokenList {...props} />
    </div>
  );
}

function TokenList(props: {
  readonly api: ChromeApi;
  readonly view: AgentsView;
  readonly reload: () => void;
}): JSX.Element {
  const { api, view, reload } = props;
  if (view.tokens.length === 0) {
    return <p class="group-note">{text.tokens.none}</p>;
  }
  return (
    <ul class="group" aria-label={text.tokens.title}>
      {view.tokens.map((token) => (
        <Token key={token.id} api={api} token={token} accounts={view.accounts} reload={reload} />
      ))}
    </ul>
  );
}

/**
 * Settings › Agents (ADR 0019): the switch for the MCP server, where agents
 * connect, the tokens that let them in, and what they did since YapYap
 * started. While agents may not connect, only the switch shows.
 */
export function AgentsSection(props: {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element {
  const { api, snapshot, onChange } = props;
  const on = snapshot.values['agents.enabled'] === true;
  const [view, reload] = useAgentsView(api, on);
  return (
    <div class="agents" aria-busy={on && view === null}>
      <Group id="agents-access" title={text.access}>
        {fieldsOf(['agents.enabled'], snapshot, onChange)}
        {on && view !== null ? <Address api={api} view={view} /> : null}
      </Group>
      <AgentsDetails api={api} view={view} on={on} reload={reload} />
    </div>
  );
}

function AgentsDetails(props: {
  readonly api: ChromeApi;
  readonly view: AgentsView | null;
  readonly on: boolean;
  readonly reload: () => void;
}): JSX.Element {
  const { api, view, on, reload } = props;
  if (!on) {
    return <p class="group-note">{text.off}</p>;
  }
  if (view === null) {
    return <p>{en.common.loading}</p>;
  }
  return (
    <>
      <Tokens api={api} view={view} reload={reload} />
      <Activity view={view} />
    </>
  );
}
