/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi } from '../../shared/chrome-api.ts';
import { NewChat } from './NewChat.tsx';

function api(opened: boolean) {
  return {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: { problem: vi.fn(), retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      restart: vi.fn(),
      export: vi.fn(),
      import: vi.fn(),
    },
    chat: {
      openNumber: vi.fn<(number: string) => Promise<boolean>>(() => Promise.resolve(opened)),
    },
    accounts: {
      list: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      permissions: vi.fn(),
      forgetPermissions: vi.fn(),
    },
    sidebar: {
      state: vi.fn(),
      switchTo: vi.fn(),
      setCompact: vi.fn(),
      stopSharing: vi.fn(),
      onState: vi.fn(),
    },
    plugins: { list: vi.fn(), consent: vi.fn(), answer: vi.fn() },
    picker: { offer: vi.fn(), choose: vi.fn(), cancel: vi.fn() },
    shortcuts: { list: vi.fn() },
  } satisfies ChromeApi;
}

const field = () => screen.getByLabelText<HTMLInputElement>('Phone number, with the country code');
const openButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Open Chat' });

describe('NewChat', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('enables Open Chat only for an international number', () => {
    render(<NewChat api={api(true)} />);
    expect(openButton().disabled).toBe(true);
    fireEvent.input(field(), { target: { value: '07700 900123' } });
    expect(openButton().disabled).toBe(true);
    fireEvent.input(field(), { target: { value: '+44 7700 900123' } });
    expect(openButton().disabled).toBe(false);
    expect(screen.getByText(/YapYap does not save the number/)).toBeTruthy();
  });

  it('opens the chat with what the user typed and closes', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const chrome = api(true);
    render(<NewChat api={chrome} />);
    fireEvent.input(field(), { target: { value: '+44 7700 900123' } });
    fireEvent.click(openButton());
    await waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
    });
    expect(chrome.chat.openNumber).toHaveBeenCalledExactlyOnceWith('+44 7700 900123');
  });

  it('says so when WhatsApp cannot open the chat, until the number changes', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    render(<NewChat api={api(false)} />);
    fireEvent.input(field(), { target: { value: '+44 7700 900123' } });
    fireEvent.click(openButton());
    expect(await screen.findByText(/WhatsApp is not ready to open the chat/)).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    fireEvent.input(field(), { target: { value: '+44 7700 900124' } });
    expect(screen.queryByText(/WhatsApp is not ready/)).toBeNull();
  });

  it('closes on Cancel without opening anything', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const chrome = api(true);
    render(<NewChat api={chrome} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledOnce();
    expect(chrome.chat.openNumber).not.toHaveBeenCalled();
  });
});
