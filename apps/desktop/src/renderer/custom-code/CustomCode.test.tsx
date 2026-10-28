/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, CustomCodeView } from '../../shared/chrome-api.ts';
import type { CustomCode } from '../../shared/custom-code.ts';
import { CustomCodeEditor } from './CustomCode.tsx';

const WORK = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';

const VIEW: CustomCodeView = {
  code: {
    enabled: false,
    snippets: { [WORK]: { css: '#app { margin: 0 }', js: 'console.log(1);' } },
  },
  scopes: [
    { id: 'all', label: 'All accounts' },
    { id: WORK, label: 'Work' },
  ],
};

function api(get: () => Promise<CustomCodeView> = () => Promise.resolve(VIEW)) {
  return {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: { problem: vi.fn(), retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      restart: vi.fn(),
      export: vi.fn(),
      import: vi.fn(),
      chooseFolder: vi.fn(),
    },
    chat: { openNumber: vi.fn() },
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
    quickPanel: { open: vi.fn(), setDoNotDisturb: vi.fn() },
    extensions: {
      list: vi.fn(),
      consent: vi.fn(),
      answer: vi.fn(),
      setGrant: vi.fn(),
      setSetting: vi.fn(),
      remove: vi.fn(),
      marketplace: vi.fn(),
      installListed: vi.fn(),
      onChange: vi.fn(),
    },
    report: { diagnostics: vi.fn(), open: vi.fn() },
    picker: { offer: vi.fn(), choose: vi.fn(), cancel: vi.fn() },
    shortcuts: { list: vi.fn(), set: vi.fn() },
    downloads: { list: vi.fn(), act: vi.fn(), clear: vi.fn() },
    spelling: { languages: vi.fn(), choose: vi.fn() },
    customCode: {
      get: vi.fn(get),
      save: vi.fn((code: CustomCode) => Promise.resolve({ ...VIEW, code })),
      preview: vi.fn(() => Promise.resolve()),
    },
    proxyLogin: { request: vi.fn(), answer: vi.fn() },
  } satisfies ChromeApi;
}

const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
const css = () => screen.getByLabelText<HTMLTextAreaElement>('CSS');
const js = () => screen.getByLabelText<HTMLTextAreaElement>('JavaScript');
const enabled = () => screen.getByLabelText<HTMLInputElement>('Use custom CSS and JavaScript');
const scope = () => screen.getByLabelText<HTMLSelectElement>('Applies to');

async function opened(chrome = api()) {
  render(<CustomCodeEditor api={chrome} />);
  await waitFor(() => {
    expect(saveButton().disabled).toBe(false);
  });
  return chrome;
}

describe('CustomCodeEditor', () => {
  afterEach(() => {
    cleanup();
  });

  it('warns first, starts off, and shows each scope’s code', async () => {
    await opened();
    expect(screen.getByText(/can read your chats/)).toBeTruthy();
    expect(enabled().checked).toBe(false);
    expect(css().value).toBe('');
    fireEvent.change(scope(), { target: { value: WORK } });
    expect(css().value).toBe('#app { margin: 0 }');
    expect(js().value).toBe('console.log(1);');
  });

  it('shows CSS in WhatsApp as the user types, once custom code is on', async () => {
    const chrome = await opened();
    fireEvent.input(css(), { target: { value: 'p { color: red }' } });
    expect(chrome.customCode.preview).toHaveBeenLastCalledWith('all', '');
    fireEvent.click(enabled());
    expect(chrome.customCode.preview).toHaveBeenLastCalledWith('all', 'p { color: red }');
    fireEvent.input(js(), { target: { value: 'alert(1)' } });
    expect(chrome.customCode.preview).toHaveBeenCalledTimes(2);
  });

  it('saves the draft and says so, until the next change', async () => {
    const chrome = await opened();
    fireEvent.click(enabled());
    fireEvent.input(js(), { target: { value: 'document.title;' } });
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeTruthy();
    });
    expect(chrome.customCode.save).toHaveBeenCalledExactlyOnceWith({
      enabled: true,
      snippets: { ...VIEW.code.snippets, all: { css: '', js: 'document.title;' } },
    });
    fireEvent.input(js(), { target: { value: '' } });
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('says when the code could not be saved', async () => {
    const chrome = api();
    chrome.customCode.save.mockRejectedValueOnce(new Error('disk full'));
    await opened(chrome);
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText('Could not save the code.')).toBeTruthy();
    });
  });

  it('takes back unsaved CSS when the window closes, and nothing once saved', async () => {
    const chrome = await opened();
    fireEvent.input(css(), { target: { value: 'p {}' } });
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(chrome.customCode.preview).toHaveBeenLastCalledWith('all', null);
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeTruthy();
    });
    chrome.customCode.preview.mockClear();
    globalThis.dispatchEvent(new Event('pagehide'));
    cleanup();
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(chrome.customCode.preview).not.toHaveBeenCalled();
  });

  it('cannot save before the code has loaded', () => {
    render(<CustomCodeEditor api={api(() => Promise.reject(new Error('gone')))} />);
    expect(saveButton().disabled).toBe(true);
  });
});
