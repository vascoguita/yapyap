import { unreadInTitle } from '../../adapter/page-state.ts';
import { en } from '../../shared/messages/en.ts';

export interface SignalDependencies {
  /** The window's title: the active account's page title. */
  readonly setTitle: (title: string) => void;
  /** Unread chats across every account, for the app badge. */
  readonly showUnread: (total: number) => void;
  readonly initialTitle: string;
}

/** What the window shows of all accounts at once. */
export interface AccountSignals {
  /** An account's page changed its title, which also carries its unread count. */
  readonly pageTitle: (id: string, title: string) => void;
  readonly activate: (id: string) => void;
  readonly forget: (id: string) => void;
  /** Marks the title while offline: unobtrusive, and visible in the taskbar. */
  readonly setOnline: (online: boolean) => void;
}

export function accountSignals(deps: SignalDependencies): AccountSignals {
  const titles = new Map<string, string>();
  let active = '';
  let online = true;
  const applyTitle = (): void => {
    const title = titles.get(active) ?? deps.initialTitle;
    deps.setTitle(online ? title : en.windows.offline(title));
  };
  const applyUnread = (): void => {
    deps.showUnread([...titles.values()].reduce((total, title) => total + unreadInTitle(title), 0));
  };
  return {
    pageTitle: (id, title) => {
      titles.set(id, title);
      applyUnread();
      if (id === active) {
        applyTitle();
      }
    },
    activate: (id) => {
      active = id;
      applyTitle();
    },
    forget: (id) => {
      titles.delete(id);
      applyUnread();
    },
    setOnline: (isOnline) => {
      online = isOnline;
      applyTitle();
    },
  };
}
