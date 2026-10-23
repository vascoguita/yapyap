import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ChromeApi, SidebarAccount, SidebarState } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.sidebar;

/** The first letter of the name, which the avatar shows like a contact's initial. */
function initial(name: string): string {
  // Names are never blank (the Accounts window trims and checks them).
  return Array.from(name.trim()).slice(0, 1).join('').toUpperCase();
}

/** A speaker with a slash, drawn rather than written, so it reads in every language. */
function MutedIcon(): JSX.Element {
  return (
    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
      <path d="M11 5l4 6M15 5l-4 6" stroke="currentColor" stroke-width="1.5" />
    </svg>
  );
}

function Mark({ account }: { readonly account: SidebarAccount }): JSX.Element | null {
  if (account.muted) {
    return <MutedIcon />;
  }
  return account.unread > 0 ? (
    <span class="badge" aria-hidden="true">
      {text.badge(account.unread)}
    </span>
  ) : null;
}

function AccountButton(props: {
  readonly account: SidebarAccount;
  readonly compact: boolean;
  readonly onSwitch: (id: string) => void;
}): JSX.Element {
  const { account, compact } = props;
  const label = text.account(account.name, account.unread, account.muted);
  return (
    <li>
      <button
        type="button"
        aria-current={account.active ? 'page' : undefined}
        aria-label={label}
        title={compact ? label : undefined}
        onClick={() => {
          props.onSwitch(account.id);
        }}
      >
        <span class={`avatar swatch-${account.color}`} aria-hidden="true">
          {initial(account.name)}
        </span>
        {compact ? null : <span class="name">{account.name}</span>}
        <Mark account={account} />
      </button>
    </li>
  );
}

/** The latest state: pushed by YapYap, or asked for once in case a push came before the page. */
function useSidebarState(api: ChromeApi): SidebarState | null {
  const [state, setState] = useState<SidebarState | null>(null);
  useEffect(() => {
    api.sidebar.onState(setState);
    api.sidebar
      .state()
      .then((first) => {
        setState((current) => current ?? first);
      })
      .catch(() => undefined);
  }, [api]);
  return state;
}

function Footer({ api, state }: { readonly api: ChromeApi; readonly state: SidebarState }) {
  const { compact } = state;
  const layout = compact ? text.full : text.compact;
  return (
    <footer>
      {state.doNotDisturb ? (
        <p class="dnd" title={text.doNotDisturb}>
          <MutedIcon />
          {compact ? null : text.doNotDisturb}
        </p>
      ) : null}
      <button
        type="button"
        class="layout"
        aria-label={layout}
        title={layout}
        onClick={() => {
          void api.sidebar.setCompact(!compact);
        }}
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d={compact ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} stroke="currentColor" fill="none" />
        </svg>
      </button>
    </footer>
  );
}

/**
 * The accounts beside WhatsApp: a click switches, without reloading, to the
 * account's own view. Ctrl or Cmd with a digit does the same from anywhere.
 */
export function Sidebar({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const state = useSidebarState(api);
  const switchTo = useCallback(
    (id: string): void => {
      void api.sidebar.switchTo(id);
    },
    [api],
  );
  if (state === null) {
    return null;
  }
  return (
    <nav class={state.compact ? 'compact' : undefined} aria-label={text.label}>
      <ul>
        {state.accounts.map((account) => (
          <AccountButton
            key={account.id}
            account={account}
            compact={state.compact}
            onSwitch={switchTo}
          />
        ))}
      </ul>
      <Footer api={api} state={state} />
    </nav>
  );
}
