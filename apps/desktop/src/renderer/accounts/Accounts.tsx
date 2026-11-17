import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  AccountChange,
  AccountList,
  AccountSummary,
  ChromeApi,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { isProxyAddress } from '../../shared/proxy-address.ts';
import { Group, Pill } from '../settings/Field.tsx';
import { Avatar } from '../shared/avatar.tsx';
import { DiscardPrompt } from '../shared/discard.tsx';
import { useEscapeToClose } from '../shared/escape.ts';
import { Icon } from '../shared/icons.tsx';

const text = en.accounts;

/** Where the user asked to go while an edit was unsaved: another account, a new one, or away. */
type Pending =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'add' }
  | { readonly kind: 'close' };

const changeOf = ({ name, color, enabled, muted, proxy }: AccountSummary): AccountChange => ({
  name,
  color,
  enabled,
  muted,
  proxy,
});

function isDirty(draft: AccountChange, account: AccountSummary): boolean {
  const saved = changeOf(account);
  return (Object.keys(saved) as (keyof AccountChange)[]).some((key) => draft[key] !== saved[key]);
}

/** As the menu and YapYap itself refuse: WhatsApp keeps running in one account at least. */
function isLastRunning(list: AccountList, account: AccountSummary): boolean {
  return (
    account.enabled && list.accounts.every((other) => other.id === account.id || !other.enabled)
  );
}

function colorName(color: string): string {
  return (text.colors as Readonly<Record<string, string>>)[color] ?? color;
}

function AccountRow(props: {
  readonly account: AccountSummary;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  const { account, selected, onSelect } = props;
  const notes = [
    account.enabled ? '' : text.off,
    account.muted ? text.muted : '',
    account.active ? text.shown : '',
  ];
  return (
    <li>
      <button
        type="button"
        class={account.enabled ? undefined : 'off'}
        aria-pressed={selected}
        onClick={() => {
          onSelect(account.id);
        }}
      >
        <Avatar name={account.name} color={account.color} photo={undefined} />
        <span class="account-text">
          <span class="account-name">{account.name}</span>{' '}
          <span class="hint">{notes.filter((note) => note !== '').join(' · ')}</span>
        </span>
      </button>
    </li>
  );
}

/** The accounts beside the one being edited, as Settings lists its pages, and a way to add one. */
function AccountNav(props: {
  readonly list: AccountList;
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
}): JSX.Element {
  return (
    <nav class="accounts-nav" aria-label={text.title}>
      <ul class="account-list" aria-label={text.listLabel}>
        {props.list.accounts.map((entry) => (
          <AccountRow
            key={entry.id}
            account={entry}
            selected={entry.id === props.selected}
            onSelect={props.onSelect}
          />
        ))}
      </ul>
      <button type="button" class="add-account" onClick={props.onAdd}>
        <Icon name="plus" />
        {text.addAccount}
      </button>
    </nav>
  );
}

/** Swatches that are real radio buttons, named by their color for screen readers. */
function ColorChoice(props: {
  readonly colors: readonly string[];
  readonly value: string;
  readonly onChange: (color: string) => void;
}): JSX.Element {
  return (
    <div class="row">
      <div class="row-text">
        <span id="color-label" class="row-label">
          {text.color}
        </span>
      </div>
      <div class="row-control">
        <div role="radiogroup" class="swatches" aria-labelledby="color-label">
          {props.colors.map((color) => (
            <label key={color} class="swatch-option" title={colorName(color)}>
              <input
                type="radio"
                name="color"
                value={color}
                checked={props.value === color}
                onChange={() => {
                  props.onChange(color);
                }}
              />
              <span class={`swatch swatch-${color}`} aria-hidden="true">
                <Icon name="check" />
              </span>
              <span class="visually-hidden">{colorName(color)}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DraftProps {
  readonly draft: AccountChange;
  readonly onChange: (draft: AccountChange) => void;
}

function NameField({ draft, onChange }: DraftProps): JSX.Element {
  return (
    <div class="row stacked">
      <label class="row-label" for="name">
        {text.name}
      </label>
      <input
        id="name"
        type="text"
        maxLength={40}
        value={draft.name}
        onInput={(event) => {
          onChange({ ...draft, name: event.currentTarget.value });
        }}
      />
    </div>
  );
}

/** The account's own proxy; empty uses the one in Settings (#76). */
function ProxyField({ draft, onChange }: DraftProps): JSX.Element {
  const valid = isProxyAddress(draft.proxy);
  return (
    <div class="row stacked">
      <label class="row-label" for="proxy">
        {text.proxy}
      </label>
      <input
        id="proxy"
        type="text"
        spellcheck={false}
        placeholder={text.proxyPlaceholder}
        value={draft.proxy}
        aria-invalid={!valid}
        aria-describedby="proxy-hint"
        onInput={(event) => {
          onChange({ ...draft, proxy: event.currentTarget.value.trim() });
        }}
      />
      <p id="proxy-hint" class={valid ? 'hint' : 'hint invalid'}>
        {valid ? text.proxyHint : text.proxyInvalid}
      </p>
    </div>
  );
}

/** An on/off switch of the draft, as a Settings row: the whole row flips it. */
function SwitchField(
  props: DraftProps & {
    readonly field: 'enabled' | 'muted';
    readonly label: string;
    readonly hint: string;
  },
): JSX.Element {
  const { draft, onChange, field } = props;
  return (
    <div class="row">
      <div class="row-text">
        <label class="row-label" for={field}>
          {props.label}
        </label>
        <p id={`${field}-hint`} class="hint">
          {props.hint}
        </p>
      </div>
      <div class="row-control">
        <input
          id={field}
          type="checkbox"
          role="switch"
          class="switch"
          checked={draft[field]}
          aria-describedby={`${field}-hint`}
          onChange={(event) => {
            onChange({ ...draft, [field]: event.currentTarget.checked });
          }}
        />
      </div>
    </div>
  );
}

function Switches({ draft, onChange }: DraftProps): JSX.Element {
  return (
    <Group id="activity" title={text.groups.activity}>
      <SwitchField
        draft={draft}
        onChange={onChange}
        field="enabled"
        label={text.run}
        hint={text.runHint}
      />
      <SwitchField
        draft={draft}
        onChange={onChange}
        field="muted"
        label={text.mute}
        hint={text.muteHint}
      />
    </Group>
  );
}

interface EditorProps extends DraftProps {
  readonly api: ChromeApi;
  readonly id: string;
  readonly colors: readonly string[];
  readonly dirty: boolean;
  /** False for the last running account, which YapYap keeps. */
  readonly removable: boolean;
  readonly onSave: (id: string, change: AccountChange) => void;
  readonly onRevert: () => void;
  readonly onRemove: (id: string) => void;
  /** Why the last save or removal did not happen. */
  readonly error: string;
}

function Editor(props: EditorProps): JSX.Element {
  const { id, draft, onChange, onSave, onRemove } = props;
  const submit = useCallback(
    (event: SubmitEvent): void => {
      event.preventDefault();
      onSave(id, draft);
    },
    [id, draft, onSave],
  );
  const pickColor = useCallback(
    (color: string): void => {
      onChange({ ...draft, color });
    },
    [draft, onChange],
  );
  const remove = useCallback((): void => {
    onRemove(id);
  }, [id, onRemove]);
  return (
    <form class="editor" onSubmit={submit}>
      <Group id="identity" title={text.groups.identity}>
        <NameField draft={draft} onChange={onChange} />
        <ColorChoice colors={props.colors} value={draft.color} onChange={pickColor} />
      </Group>
      <Switches draft={draft} onChange={onChange} />
      <Group id="network" title={text.groups.network}>
        <ProxyField draft={draft} onChange={onChange} />
      </Group>
      <Permissions key={id} api={props.api} id={id} />
      <RemoveGroup removable={props.removable} onRemove={remove} />
      <SaveBar draft={draft} dirty={props.dirty} error={props.error} onRevert={props.onRevert} />
    </form>
  );
}

/** Removing is apart from the rest, last, since it cannot be undone. */
function RemoveGroup(props: {
  readonly removable: boolean;
  readonly onRemove: () => void;
}): JSX.Element {
  return (
    <Group id="remove" title={text.groups.remove}>
      <div class="row">
        <div class="row-text">
          <span class="row-label">{text.removeLabel}</span>
          <p id="remove-hint" class="hint">
            {props.removable ? en.dialogs.removeAccount.detail : text.removeRefused}
          </p>
        </div>
        <div class="row-control">
          <button
            type="button"
            class="danger"
            disabled={!props.removable}
            aria-describedby="remove-hint"
            onClick={props.onRemove}
          >
            <Icon name="remove" />
            {text.remove}
          </button>
        </div>
      </div>
    </Group>
  );
}

/** Edits stay a draft until saved, so saving stays in sight however far the page scrolls. */
function SaveBar(props: {
  readonly draft: AccountChange;
  readonly dirty: boolean;
  readonly error: string;
  readonly onRevert: () => void;
}): JSX.Element {
  const { draft, dirty } = props;
  const valid = draft.name.trim() !== '' && isProxyAddress(draft.proxy);
  return (
    <div class={dirty ? 'save-bar dirty' : 'save-bar'}>
      <div class="save-status">
        <p role="alert">{props.error}</p>
        <output>{dirty ? text.unsaved : ''}</output>
      </div>
      <button type="button" disabled={!dirty} onClick={props.onRevert}>
        {en.common.cancel}
      </button>
      <button type="submit" disabled={!dirty || !valid}>
        {text.save}
      </button>
    </div>
  );
}

function PermissionRow(props: {
  readonly label: string;
  readonly children: ComponentChildren;
}): JSX.Element {
  return (
    <div class="row">
      <div class="row-text">
        <span class="row-label">{props.label}</span>
      </div>
      <div class="row-control">{props.children}</div>
    </div>
  );
}

/** `audio` and `video` the account was allowed until YapYap quits; null while unknown or off. */
function useAllowed(api: ChromeApi, id: string) {
  const [allowed, setAllowed] = useState<readonly string[] | null>(null);
  useEffect(() => {
    api.accounts.permissions(id).then(setAllowed, () => {
      setAllowed(null);
    });
  }, [api, id]);
  return [allowed, setAllowed] as const;
}

const words = text.permissions;

function PermissionRows({ allowed }: { readonly allowed: readonly string[] }): JSX.Element {
  const device = (type: string): JSX.Element =>
    allowed.includes(type) ? (
      <Pill tone="success" label={words.allowed} />
    ) : (
      <Pill tone="neutral" label={words.asks} />
    );
  return (
    <div class="group">
      <PermissionRow label={words.camera}>{device('video')}</PermissionRow>
      <PermissionRow label={words.microphone}>{device('audio')}</PermissionRow>
      <PermissionRow label={words.notifications}>
        <span class="state">{words.notificationsState}</span>
      </PermissionRow>
      <PermissionRow label={words.screen}>
        <span class="state">{words.screenState}</span>
      </PermissionRow>
    </div>
  );
}

/** What the account may use, and the one answer the user can take back (#77). */
function Permissions({ api, id }: { readonly api: ChromeApi; readonly id: string }) {
  const [allowed, setAllowed] = useAllowed(api, id);
  if (allowed === null) {
    return null;
  }
  return (
    <section class="group-section" aria-labelledby="permissions-title">
      <div class="group-head">
        <h2 id="permissions-title" class="group-title">
          {words.title}
        </h2>
        <button
          type="button"
          disabled={allowed.length === 0}
          onClick={() => {
            api.accounts.forgetPermissions(id).then(setAllowed, () => undefined);
          }}
        >
          {words.forget}
        </button>
      </div>
      <PermissionRows allowed={allowed} />
    </section>
  );
}

interface WindowState {
  readonly list: AccountList | null | undefined;
  readonly account: AccountSummary | undefined;
  /** The unsaved edit of the selected account, if the user changed anything. */
  readonly edit: AccountChange | undefined;
  readonly setEdit: (edit: AccountChange) => void;
  readonly select: (id: string) => void;
  /** Shows a fresh list with `id` selected, or the account on screen. */
  readonly show: (list: AccountList, id?: string) => void;
  readonly revert: () => void;
}

function useAccountList(api: ChromeApi): WindowState {
  const [list, setList] = useState<AccountList | null | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [edit, setEdit] = useState<AccountChange | undefined>(undefined);
  const select = useCallback((id: string): void => {
    setSelectedId(id);
    setEdit(undefined);
  }, []);
  const show = useCallback((next: AccountList, id?: string): void => {
    const chosen = next.accounts.find((candidate) => candidate.id === id);
    setList(next);
    setSelectedId((chosen ?? next.accounts.find((candidate) => candidate.active))?.id);
    setEdit(undefined);
  }, []);
  const revert = useCallback((): void => {
    setEdit(undefined);
  }, []);
  useEffect(() => {
    api.accounts.list().then(show, () => {
      setList(null);
    });
  }, [api, show]);
  const account = list?.accounts.find((candidate) => candidate.id === selectedId);
  return { list, account, edit, setEdit, select, show, revert };
}

/** Goes where the user asked: away, to a new account, or to another one. */
function useLeave(select: (id: string) => void, add: () => void): (target: Pending) => void {
  return useCallback(
    (target: Pending): void => {
      if (target.kind === 'close') {
        window.close();
      } else if (target.kind === 'add') {
        add();
      } else {
        select(target.id);
      }
    },
    [select, add],
  );
}

interface Leaving {
  readonly pending: Pending | undefined;
  readonly request: (pending: Pending) => void;
  readonly settle: (discard: boolean) => void;
}

/** Leaving an unsaved edit, by Escape, by picking another account or by adding one, asks first. */
function useLeaving(state: WindowState, add: () => void): Leaving {
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const leave = useLeave(state.select, add);
  const changed =
    state.account !== undefined && state.edit !== undefined && isDirty(state.edit, state.account);
  const request = useCallback(
    (target: Pending): void => {
      if (changed) {
        setPending(target);
      } else {
        leave(target);
      }
    },
    [changed, leave],
  );
  const settle = useCallback(
    (discard: boolean): void => {
      setPending(undefined);
      if (discard && pending !== undefined) {
        leave(pending);
      }
    },
    [pending, leave],
  );
  return { pending, request, settle };
}

interface Actions {
  readonly error: string;
  /** The account just added here, which the window helps to link. */
  readonly added: string | undefined;
  readonly save: (id: string, change: AccountChange) => void;
  readonly remove: (id: string) => void;
  readonly add: () => void;
}

/** Saving, removing and adding; YapYap answers with the accounts as they now are. */
function useActions(api: ChromeApi, show: WindowState['show']): Actions {
  const [error, setError] = useState('');
  const [added, setAdded] = useState<string | undefined>(undefined);
  const failed = useCallback((): void => {
    setError(text.failed);
  }, []);
  const answer = useCallback(
    (refusal: string, id: string) =>
      (next: AccountList | null): void => {
        setError(next === null ? refusal : '');
        if (next !== null) {
          show(next, id);
        }
      },
    [show],
  );
  const save = useCallback(
    (id: string, change: AccountChange): void => {
      api.accounts.save(id, change).then(answer(text.refused, id), failed);
    },
    [api, answer, failed],
  );
  const remove = useCallback(
    (id: string): void => {
      api.accounts.remove(id).then(answer(text.removeRefused, id), failed);
    },
    [api, answer, failed],
  );
  const add = useCallback((): void => {
    api.accounts.add().then((next) => {
      // The main window shows the new account at once, so it is the one on screen.
      setAdded(next.accounts.find((candidate) => candidate.active)?.id);
      setError('');
      show(next);
    }, failed);
  }, [api, show, failed]);
  return { error, added, save, remove, add };
}

function NoAccounts({ loading }: { readonly loading: boolean }): JSX.Element {
  return (
    <main class="settings-pane" aria-busy={loading}>
      <div class="settings-content">
        <h1>{text.title}</h1>
        <p>{loading ? en.common.loading : text.unavailable}</p>
      </div>
    </main>
  );
}

function Heading(props: {
  readonly account: AccountSummary;
  readonly added: boolean;
}): JSX.Element {
  return (
    <>
      <h1 id="account-title">{props.account.name}</h1>
      <p class="intro">{text.hint}</p>
      {props.added ? <Added name={props.account.name} /> : null}
    </>
  );
}

/** Where to link the account just added: WhatsApp shows its code in the main window. */
function Added({ name }: { readonly name: string }): JSX.Element {
  return (
    <p class="status-line success">
      <Icon name="check" />
      <output>{text.added({ name })}</output>
    </p>
  );
}

/** Picking another account and adding one, which ask first while an edit is unsaved. */
function useRequests(request: Leaving['request']): {
  readonly select: (id: string) => void;
  readonly add: () => void;
} {
  const select = useCallback(
    (id: string): void => {
      request({ kind: 'select', id });
    },
    [request],
  );
  const add = useCallback((): void => {
    request({ kind: 'add' });
  }, [request]);
  return { select, add };
}

/** Escape closes through the same prompt as picking another account, which asks the same question. */
function useCloseOnEscape(request: Leaving['request']): void {
  useEscapeToClose({
    close: () => {
      request({ kind: 'close' });
    },
  });
}

/**
 * Renames, recolors, turns off, removes and adds accounts, laid out as
 * Settings is. Edits stay a draft until saved, and YapYap checks each
 * change again before applying it.
 */
export function Accounts({ api }: { readonly api: ChromeApi }): JSX.Element {
  const state = useAccountList(api);
  const actions = useActions(api, state.show);
  const leaving = useLeaving(state, actions.add);
  useCloseOnEscape(leaving.request);
  const { select, add } = useRequests(leaving.request);
  const { list, account } = state;
  if (list == null || account === undefined) {
    return <NoAccounts loading={list === undefined} />;
  }
  const draft = state.edit ?? changeOf(account);
  return (
    <div class="accounts-window">
      <AccountNav list={list} selected={account.id} onSelect={select} onAdd={add} />
      <main class="settings-pane accounts" aria-labelledby="account-title">
        <div class="settings-content">
          <Heading account={account} added={actions.added === account.id} />
          {leaving.pending === undefined ? null : (
            <DiscardPrompt message={text.discard} onSettle={leaving.settle} />
          )}
          <Editor
            api={api}
            id={account.id}
            draft={draft}
            colors={list.colors}
            dirty={isDirty(draft, account)}
            removable={!isLastRunning(list, account)}
            onChange={state.setEdit}
            onSave={actions.save}
            onRevert={state.revert}
            onRemove={actions.remove}
            error={actions.error}
          />
        </div>
      </main>
    </div>
  );
}
