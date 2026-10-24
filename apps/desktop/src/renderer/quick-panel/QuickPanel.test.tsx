/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, SidebarState } from '../../shared/chrome-api.ts';
import { QuickPanel } from './QuickPanel.tsx';

const STATE: SidebarState = {
  accounts: [
    { id: 'a', name: 'Home', color: 'green', unread: 3, muted: false, active: true, sharing: true },
    {
      id: 'b',
      name: 'Work',
      color: 'blue',
      unread: 0,
      muted: false,
      active: false,
      sharing: false,
    },
  ],
  compact: true,
  doNotDisturb: false,
};

function setup(state: () => Promise<SidebarState | null> = () => Promise.resolve(STATE)) {
  let push: ((next: SidebarState) => void) | undefined;
  const sidebar = {
    state: vi.fn(state),
    stopSharing: vi.fn(() => Promise.resolve()),
    onState: vi.fn((listener: (next: SidebarState) => void) => {
      push = listener;
    }),
  };
  const quickPanel = {
    open: vi.fn(() => Promise.resolve()),
    setDoNotDisturb: vi.fn(() => Promise.resolve()),
  };
  render(<QuickPanel api={{ sidebar, quickPanel } as unknown as ChromeApi} />);
  return {
    sidebar,
    quickPanel,
    push: (next: SidebarState) => {
      void act(() => {
        push?.(next);
      });
    },
  };
}

afterEach(() => {
  cleanup();
});

describe('QuickPanel', () => {
  it('lists the accounts with their names, whatever the sidebar’s layout', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Home, 3 unread chats' })).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
  });

  it('opens an account in YapYap’s window, and stops a share', async () => {
    const t = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Work' }));
    expect(t.quickPanel.open).toHaveBeenCalledExactlyOnceWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing your screen in Home' }));
    expect(t.sidebar.stopSharing).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('turns Do not disturb on and off, and follows changes made elsewhere', async () => {
    const t = setup();
    const quiet = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Do not disturb' });
    expect(quiet.checked).toBe(false);
    fireEvent.click(quiet);
    expect(t.quickPanel.setDoNotDisturb).toHaveBeenCalledExactlyOnceWith(true);
    t.push({ ...STATE, doNotDisturb: true });
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Do not disturb' }).checked).toBe(
      true,
    );
  });

  it('shows nothing until it knows the accounts', () => {
    setup(() => new Promise(() => undefined));
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
