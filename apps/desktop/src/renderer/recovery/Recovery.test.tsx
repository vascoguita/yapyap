/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, RecoveryProblem } from '../../shared/chrome-api.ts';
import { Recovery } from './Recovery.tsx';

function api(
  problem: Promise<RecoveryProblem | null>,
  overrides: Partial<ChromeApi['recovery']> = {},
) {
  return {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: {
      problem: vi.fn(() => problem),
      retry: vi.fn(() => Promise.resolve()),
      clearCache: vi.fn(() => Promise.resolve()),
      copyDiagnostics: vi.fn(() => Promise.resolve()),
      ...overrides,
    },
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
    assistantBar: {
      state: vi.fn(),
      suggest: vi.fn(),
      prompt: vi.fn(),
      confirm: vi.fn(),
      use: vi.fn(),
      send: vi.fn(),
      onState: vi.fn(),
    },
    quickPanel: { open: vi.fn(), setDoNotDisturb: vi.fn() },
    recordPrompt: { state: vi.fn(), answer: vi.fn(), stop: vi.fn(), onState: vi.fn() },
    recorder: { onCommand: vi.fn(), chunk: vi.fn(), ended: vi.fn(), failed: vi.fn() },
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
    customCode: { get: vi.fn(), save: vi.fn(), preview: vi.fn() },
    proxyLogin: { request: vi.fn(), answer: vi.fn() },
  } satisfies ChromeApi;
}

const problem = (kind: RecoveryProblem['kind']) =>
  Promise.resolve<RecoveryProblem>({ kind, description: 'details' });

describe('Recovery', () => {
  afterEach(() => {
    cleanup();
  });

  it.each<[RecoveryProblem['kind'], string, RegExp]>([
    ['unsupported', 'WhatsApp says this browser is not supported', /check for a YapYap update/],
    ['blank', 'WhatsApp did not finish loading', /stays blank/],
    ['load-failed', 'WhatsApp could not be reached', /internet connection/],
    ['crashed', 'WhatsApp keeps stopping', /keeps happening/],
  ])('explains a %s problem', async (kind, title, advice) => {
    render(<Recovery api={api(problem(kind))} />);
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByText(advice)).toBeTruthy();
  });

  it('falls back to the blank-page explanation when the problem is unknown', async () => {
    render(<Recovery api={api(Promise.reject(new Error('gone')))} />);
    expect(
      await screen.findByRole('heading', { name: 'WhatsApp did not finish loading' }),
    ).toBeTruthy();
  });

  it.each<[string, keyof ChromeApi['recovery'], string]>([
    ['Try again', 'retry', 'Retrying…'],
    ['Clear cache and try again', 'clearCache', 'Cache cleared. Retrying…'],
    ['Copy diagnostics', 'copyDiagnostics', 'Diagnostics copied to the clipboard.'],
  ])('runs "%s" and announces it', async (label, action, status) => {
    const recoveryApi = api(problem('blank'));
    render(<Recovery api={recoveryApi} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(await screen.findByText(status)).toBeTruthy();
    expect(recoveryApi.recovery[action]).toHaveBeenCalledOnce();
  });

  it('announces a failed action', async () => {
    render(
      <Recovery api={api(problem('blank'), { retry: () => Promise.reject(new Error('no')) })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('That did not work. Please try again.')).toBeTruthy();
  });

  it('reassures that clearing the cache keeps the login', () => {
    render(<Recovery api={api(problem('blank'))} />);
    expect(screen.getByText('Clearing the cache keeps you logged in.')).toBeTruthy();
  });
});
