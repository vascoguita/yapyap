/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountList, ChromeApi } from '../../shared/chrome-api.ts';
import { Accounts } from './Accounts.tsx';

const LIST: AccountList = {
  accounts: [
    { id: 'a', name: 'Personal', color: 'green', enabled: true, active: false },
    { id: 'b', name: 'Work', color: 'blue', enabled: true, active: true },
    { id: 'c', name: 'Old', color: 'pink', enabled: false, active: false },
  ],
  // A color this YapYap has no name for still shows, by its key.
  colors: ['green', 'blue', 'teal', 'pink'],
};

function api(list: () => Promise<AccountList> = () => Promise.resolve(LIST)) {
  const accounts = {
    list: vi.fn(list),
    save: vi.fn<ChromeApi['accounts']['save']>(() => Promise.resolve(LIST)),
    remove: vi.fn<ChromeApi['accounts']['remove']>(() => Promise.resolve(LIST)),
  };
  const fake = {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: { problem: vi.fn(), retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
    settings: { get: vi.fn(), set: vi.fn(), restart: vi.fn(), export: vi.fn(), import: vi.fn() },
    chat: { openNumber: vi.fn() },
    accounts,
    picker: { offer: vi.fn(), choose: vi.fn(), cancel: vi.fn() },
  } satisfies ChromeApi;
  return { fake, accounts };
}

const name = () => screen.getByLabelText<HTMLInputElement>('Name');
const button = (label: string) => screen.getByRole<HTMLButtonElement>('button', { name: label });

async function shown() {
  const t = api();
  render(<Accounts api={t.fake} />);
  await waitFor(() => {
    expect(name().value).toBe('Work');
  });
  return t;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Accounts', () => {
  it('lists every account, marking the one on screen and those that are off', async () => {
    await shown();
    expect(screen.getByRole('list', { name: 'Your accounts' }).textContent).toContain('Old');
    expect(button('Work On screen').getAttribute('aria-pressed')).toBe('true');
    expect(button('Old Off').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('radio', { name: 'Teal' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'pink' })).toBeTruthy();
  });

  it('says so while loading and when the accounts are unavailable', async () => {
    const pending = api(() => new Promise(() => undefined));
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    render(<Accounts api={pending.fake} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    cleanup();
    render(<Accounts api={api(() => Promise.reject(new Error('gone'))).fake} />);
    await screen.findByText('Accounts are unavailable.');
    cleanup();
    render(<Accounts api={api(() => Promise.resolve({ accounts: [], colors: [] })).fake} />);
    await screen.findByText('Accounts are unavailable.');
  });

  it('keeps edits as a draft until saved, then shows what YapYap saved', async () => {
    const t = await shown();
    expect(button('Save').disabled).toBe(true);
    fireEvent.input(name(), { target: { value: 'Office' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    fireEvent.click(screen.getByLabelText('Run this account'));
    fireEvent.click(button('Save'));
    expect(t.accounts.save).toHaveBeenCalledWith('b', {
      name: 'Office',
      color: 'teal',
      enabled: false,
    });
    await waitFor(() => {
      expect(name().value).toBe('Work');
    });
  });

  it('cannot save a blank name, and Cancel brings back the saved one', async () => {
    await shown();
    fireEvent.input(name(), { target: { value: '  ' } });
    expect(button('Save').disabled).toBe(true);
    fireEvent.click(button('Cancel'));
    expect(name().value).toBe('Work');
  });

  it('explains a refused change and a failed one', async () => {
    const t = await shown();
    t.accounts.save.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('no'));
    fireEvent.input(name(), { target: { value: 'Office' } });
    fireEvent.click(button('Save'));
    await screen.findByText(/must keep running/);
    fireEvent.click(button('Save'));
    await screen.findByText('Could not save the account. Try again.');
  });

  it('switches accounts at once when nothing changed, and asks first when something did', async () => {
    await shown();
    fireEvent.click(button('Personal'));
    expect(name().value).toBe('Personal');
    fireEvent.input(name(), { target: { value: 'Home' } });
    fireEvent.click(button('Work On screen'));
    expect(screen.getByRole('alertdialog').textContent).toContain('Discard your changes');
    fireEvent.click(button('Keep Editing'));
    expect(name().value).toBe('Home');
    fireEvent.click(button('Work On screen'));
    fireEvent.click(button('Discard'));
    expect(name().value).toBe('Work');
  });

  it('closes on Escape, asking first about unsaved changes', async () => {
    await shown();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    fireEvent.input(name(), { target: { value: 'Office' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(button('Discard'));
    expect(close).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('removes the selected account through YapYap, which asks the user', async () => {
    const t = await shown();
    t.accounts.remove.mockResolvedValueOnce({ ...LIST, accounts: LIST.accounts.slice(0, 2) });
    fireEvent.click(button('Old Off'));
    fireEvent.click(button('Remove Account…'));
    expect(t.accounts.remove).toHaveBeenCalledWith('c');
    await waitFor(() => {
      expect(name().value).toBe('Work');
    });
    t.accounts.remove.mockRejectedValueOnce(new Error('no'));
    fireEvent.click(button('Remove Account…'));
    await screen.findByText('Could not save the account. Try again.');
  });
});
