/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, SidebarState } from '../../shared/chrome-api.ts';
import { Sidebar } from './Sidebar.tsx';

const STATE: SidebarState = {
  accounts: [
    {
      id: 'a',
      name: 'personal',
      color: 'green',
      unread: 3,
      muted: false,
      active: false,
      sharing: false,
    },
    { id: 'b', name: 'Work', color: 'blue', unread: 0, muted: false, active: true, sharing: false },
    { id: 'c', name: 'Shop', color: 'red', unread: 0, muted: true, active: false, sharing: false },
    {
      id: 'd',
      name: 'Club',
      color: 'teal',
      unread: 120,
      muted: false,
      active: false,
      sharing: false,
    },
  ],
  compact: false,
  doNotDisturb: false,
};

function setup(state: () => Promise<SidebarState | null> = () => Promise.resolve(STATE)) {
  let push: ((next: SidebarState) => void) | undefined;
  const sidebar = {
    state: vi.fn(state),
    switchTo: vi.fn(() => Promise.resolve()),
    setCompact: vi.fn(() => Promise.resolve()),
    stopSharing: vi.fn(() => Promise.resolve()),
    onState: vi.fn((listener: (next: SidebarState) => void) => {
      push = listener;
    }),
  };
  render(<Sidebar api={{ sidebar } as unknown as ChromeApi} />);
  return {
    sidebar,
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

describe('Sidebar', () => {
  it('lists the accounts with their initials, unread badges and muted marks', async () => {
    setup();
    const work = await screen.findByRole('button', { name: 'Work' });
    expect(work.getAttribute('aria-current')).toBe('page');
    const personal = screen.getByRole('button', { name: 'personal, 3 unread chats' });
    expect(personal.textContent).toBe('Ppersonal3');
    expect(personal.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Shop, muted' }).querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Club, 120 unread chats' }).textContent).toBe(
      'CClub99+',
    );
    expect(screen.queryByText('Do not disturb')).toBeNull();
  });

  it('shows a running share beside its account, with a way to stop it', async () => {
    const t = setup();
    await screen.findByRole('button', { name: 'Work' });
    expect(screen.queryByRole('button', { name: /Stop sharing/ })).toBeNull();
    const sharing = STATE.accounts.map((account) => ({ ...account, sharing: account.id === 'b' }));
    t.push({ ...STATE, accounts: sharing });
    const stop = screen.getByRole('button', { name: 'Stop sharing your screen in Work' });
    expect(stop.textContent).toBe('Sharing');
    fireEvent.click(stop);
    expect(t.sidebar.stopSharing).toHaveBeenCalledWith('b');
    t.push({ ...STATE, accounts: sharing, compact: true });
    expect(
      screen.getByRole('button', { name: 'Stop sharing your screen in Work' }).textContent,
    ).toBe('');
  });

  it('switches to the account clicked', async () => {
    const t = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Work' }));
    expect(t.sidebar.switchTo).toHaveBeenCalledWith('b');
  });

  it('shows avatars only when compact, and switches between the layouts', async () => {
    const t = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Show only avatars' }));
    expect(t.sidebar.setCompact).toHaveBeenCalledWith(true);
    t.push({ ...STATE, compact: true, doNotDisturb: true });
    const work = screen.getByRole('button', { name: 'Work' });
    expect(work.textContent).toBe('W');
    expect(work.getAttribute('title')).toBe('Work');
    expect(screen.getByTitle('Do not disturb').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Show account names' }));
    expect(t.sidebar.setCompact).toHaveBeenLastCalledWith(false);
  });

  it('says when do not disturb is on', async () => {
    const t = setup();
    await screen.findByRole('button', { name: 'Work' });
    t.push({ ...STATE, doNotDisturb: true });
    expect(screen.getByTitle('Do not disturb').textContent).toBe('Do not disturb');
  });

  it('keeps a state YapYap pushed before its first answer arrived', async () => {
    let answer: (state: SidebarState) => void = () => undefined;
    const t = setup(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    t.push({ ...STATE, accounts: [] });
    await act(async () => {
      answer(STATE);
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Work' })).toBeNull();
  });

  it('shows nothing until there is a state, or when asking fails', async () => {
    setup(() => Promise.reject(new Error('gone')));
    await act(() => Promise.resolve());
    expect(document.body.textContent).toBe('');
    cleanup();
    setup(() => Promise.resolve(null));
    await act(() => Promise.resolve());
    expect(document.body.textContent).toBe('');
  });
});
