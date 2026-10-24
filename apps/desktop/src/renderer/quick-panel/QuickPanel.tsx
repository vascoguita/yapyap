import type { JSX, TargetedEvent } from 'preact';
import { useCallback } from 'preact/hooks';
import type { ChromeApi } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { AccountButton, useSidebarState } from '../sidebar/Sidebar.tsx';

const text = en.sidebar;

function usePanelActions(api: ChromeApi) {
  const open = useCallback(
    (id: string): void => {
      void api.quickPanel.open(id);
    },
    [api],
  );
  const stopSharing = useCallback(
    (id: string): void => {
      void api.sidebar.stopSharing(id);
    },
    [api],
  );
  const setDoNotDisturb = useCallback(
    (event: TargetedEvent<HTMLInputElement>): void => {
      void api.quickPanel.setDoNotDisturb(event.currentTarget.checked);
    },
    [api],
  );
  return { open, stopSharing, setDoNotDisturb };
}

/**
 * The quick-access panel (#86): the sidebar's accounts in a small window on
 * top of other apps. A click switches to the account and brings YapYap's
 * window back; the switch below turns Do not disturb on or off.
 */
export function QuickPanel({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const state = useSidebarState(api);
  const { open, stopSharing, setDoNotDisturb } = usePanelActions(api);
  if (state === null) {
    return null;
  }
  return (
    <nav aria-label={text.label}>
      <ul>
        {state.accounts.map((account) => (
          <AccountButton
            key={account.id}
            account={account}
            compact={false}
            onSwitch={open}
            onStop={stopSharing}
          />
        ))}
      </ul>
      <footer>
        <label class="dnd-switch">
          <input type="checkbox" checked={state.doNotDisturb} onChange={setDoNotDisturb} />
          {text.doNotDisturb}
        </label>
      </footer>
    </nav>
  );
}
