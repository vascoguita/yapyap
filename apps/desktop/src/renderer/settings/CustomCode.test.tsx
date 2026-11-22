/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { CustomCodeView } from '../../shared/api/chrome-api.ts';
import type { CustomCode } from '../../shared/custom-code.ts';
import { CustomCodeSection } from './CustomCode.tsx';

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
  return fakeChromeApi({
    customCode: {
      get: vi.fn(get),
      save: vi.fn((code: CustomCode) => Promise.resolve({ ...VIEW, code })),
      preview: vi.fn(() => Promise.resolve()),
    },
  });
}

const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
const css = () => screen.getByLabelText<HTMLTextAreaElement>(/^CSS for/);
const js = () => screen.getByLabelText<HTMLTextAreaElement>(/^JavaScript for/);
const enabled = () =>
  screen.getByRole<HTMLInputElement>('switch', { name: 'Use custom CSS and JavaScript' });
const scope = () => screen.getByLabelText<HTMLSelectElement>('Applies to');

async function opened(chrome = api(), onUnsaved = vi.fn()) {
  render(<CustomCodeSection api={chrome} onUnsaved={onUnsaved} />);
  await waitFor(() => {
    expect(saveButton().disabled).toBe(false);
  });
  return chrome;
}

describe('CustomCodeSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('warns first, starts off, and shows each scope’s code', async () => {
    await opened();
    const warning = screen.getByText(/can read your chats/);
    expect(warning.parentElement?.firstElementChild).toBe(warning);
    expect(screen.getByRole('group', { name: 'In WhatsApp' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Your code' })).toBeTruthy();
    expect(enabled().checked).toBe(false);
    expect(css().value).toBe('');
    fireEvent.change(scope(), { target: { value: WORK } });
    expect(css().value).toBe('#app { margin: 0 }');
    expect(js().value).toBe('console.log(1);');
  });

  it('names the code being edited by its scope, and folds what all accounts run in an account under it (#748)', async () => {
    const shared = { css: 'header { color: purple }', js: '' };
    await opened(
      api(() =>
        Promise.resolve({
          ...VIEW,
          code: { ...VIEW.code, snippets: { ...VIEW.code.snippets, all: shared } },
        }),
      ),
    );
    expect(screen.getByLabelText('CSS for all accounts')).toBe(css());
    expect(screen.getByLabelText('JavaScript for all accounts')).toBe(js());
    // Under All accounts, nothing is shown twice.
    expect(screen.queryByText('Runs after the code for all accounts')).toBeNull();
    fireEvent.change(scope(), { target: { value: WORK } });
    expect(css().value).toBe('#app { margin: 0 }');
    expect(screen.getByLabelText('CSS for Work')).toBe(css());
    // Folded: the parts it has, and no code until asked.
    expect(screen.getByText('Runs after the code for all accounts')).toBeTruthy();
    expect(screen.getByText('CSS', { selector: '.hint' })).toBeTruthy();
    expect(screen.queryByText('header { color: purple }')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    // Open, it is text, never a field, with the way to edit it.
    const code = screen.getByText('header { color: purple }');
    expect(code.tagName).toBe('PRE');
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Edit for All Accounts' }));
    expect(scope().value).toBe('all');
    expect(css().value).toBe('header { color: purple }');
  });

  it('names both parts when all accounts have CSS and JavaScript, and folds them again', async () => {
    const shared = { css: 'p {}', js: 'void 0;' };
    await opened(
      api(() =>
        Promise.resolve({
          ...VIEW,
          code: { ...VIEW.code, snippets: { ...VIEW.code.snippets, all: shared } },
        }),
      ),
    );
    fireEvent.change(scope(), { target: { value: WORK } });
    expect(screen.getByText('CSS and JavaScript')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('void 0;').tagName).toBe('PRE');
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('void 0;')).toBeNull();
  });

  it('shows nothing of all accounts in an account while their code is empty, nor a scope gone', async () => {
    await opened();
    fireEvent.change(scope(), { target: { value: WORK } });
    expect(screen.queryByText('Runs after the code for all accounts')).toBeNull();
    // An account no longer listed leaves the label without a name.
    cleanup();
    await opened(
      api(() => Promise.resolve({ ...VIEW, scopes: [{ id: 'all', label: 'All accounts' }] })),
    );
    fireEvent.change(scope(), { target: { value: WORK } });
    expect(screen.getByLabelText('CSS for')).toBe(css());
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
      expect(screen.getByText('Could not save the code. Try again.')).toBeTruthy();
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

  it('takes back unsaved CSS when the user leaves the page for another', async () => {
    const chrome = await opened();
    fireEvent.change(scope(), { target: { value: WORK } });
    fireEvent.input(css(), { target: { value: 'p {}' } });
    chrome.customCode.preview.mockClear();
    cleanup();
    await waitFor(() => {
      expect(chrome.customCode.preview).toHaveBeenCalledExactlyOnceWith(WORK, null);
    });
  });

  it('tells Settings while a change is unsaved, and that none is once it goes', async () => {
    const onUnsaved = vi.fn();
    await opened(api(), onUnsaved);
    expect(onUnsaved).toHaveBeenLastCalledWith(false);
    fireEvent.input(css(), { target: { value: 'p {}' } });
    expect(onUnsaved).toHaveBeenLastCalledWith(true);
    fireEvent.input(css(), { target: { value: '' } });
    expect(onUnsaved).toHaveBeenLastCalledWith(false);
    fireEvent.click(enabled());
    expect(onUnsaved).toHaveBeenLastCalledWith(true);
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(onUnsaved).toHaveBeenLastCalledWith(false);
    });
    fireEvent.input(js(), { target: { value: 'alert(1)' } });
    expect(onUnsaved).toHaveBeenLastCalledWith(true);
    cleanup();
    await waitFor(() => {
      expect(onUnsaved).toHaveBeenLastCalledWith(false);
    });
  });

  it('cannot save before the code has loaded', () => {
    render(
      <CustomCodeSection
        api={api(() => Promise.reject(new Error('gone')))}
        onUnsaved={() => undefined}
      />,
    );
    expect(saveButton().disabled).toBe(true);
  });
});
