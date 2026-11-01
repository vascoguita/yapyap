/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, DownloadEntry } from '../../shared/chrome-api.ts';
import { Downloads, REFRESH_MS, sizeOf } from './Downloads.tsx';

const entry = (overrides: Partial<DownloadEntry>): DownloadEntry => ({
  id: 1,
  name: 'photo.jpg',
  state: 'completed',
  received: 2048,
  total: 2048,
  canResume: false,
  ...overrides,
});

function api(entries: readonly DownloadEntry[]) {
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
    assistant: {
      view: vi.fn(),
      saveKey: vi.fn(),
      forgetKey: vi.fn(),
      testKey: vi.fn(),
      findServers: vi.fn(),
      privateModel: vi.fn(),
      forgetChat: vi.fn(),
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
    picker: { offer: vi.fn(), choose: vi.fn(), cancel: vi.fn() },
    spelling: { languages: vi.fn(), choose: vi.fn() },
    report: { diagnostics: vi.fn(), open: vi.fn() },
    customCode: { get: vi.fn(), save: vi.fn(), preview: vi.fn() },
    proxyLogin: { request: vi.fn(), answer: vi.fn() },
    shortcuts: { list: vi.fn(), set: vi.fn() },
    downloads: {
      list: vi.fn(() => Promise.resolve(entries)),
      act: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
    },
  } satisfies ChromeApi;
}

const button = (name: string) => screen.getByRole('button', { name });

describe('sizeOf', () => {
  it('writes sizes as people read them', () => {
    expect(sizeOf(512)).toBe('512 B');
    expect(sizeOf(3.25 * 1024 * 1024)).toBe('3.3 MB');
    expect(sizeOf(5 * 1024 ** 4)).toBe('5,120 GB');
  });
});

describe('Downloads', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows each download with what it can do, and acts on it', async () => {
    const yapyap = api([
      entry({ id: 4, name: 'video.mp4', state: 'progressing', received: 1024, total: 4096 }),
      entry({ id: 3, name: 'song.mp3', state: 'paused', received: 1024, canResume: true }),
      entry({ id: 2, name: 'late.zip', state: 'interrupted', canResume: true }),
      entry({ id: 1, name: 'photo.jpg' }),
      entry({ id: 5, name: 'gone.pdf', state: 'cancelled' }),
      entry({ id: 6, name: 'stream.bin', state: 'progressing', received: 300, total: 0 }),
    ]);
    render(<Downloads api={yapyap} />);
    expect(await screen.findByText('1 KB of 4 KB')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'video.mp4' })).toBeTruthy();
    expect(screen.getByText('Paused at 1 KB')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('300 B')).toBeTruthy();
    expect(screen.getAllByRole('button').map((each) => each.textContent)).toEqual([
      'Pause',
      'Cancel',
      'Resume',
      'Cancel',
      'Resume',
      'Show in Folder',
      'Pause',
      'Cancel',
      'Clear Finished',
    ]);
    fireEvent.click(button('Show in Folder'));
    expect(yapyap.downloads.act).toHaveBeenCalledExactlyOnceWith(1, 'show');
    fireEvent.click(button('Clear Finished'));
    expect(yapyap.downloads.clear).toHaveBeenCalledOnce();
  });

  it('says when nothing was downloaded, and keeps up with new downloads', async () => {
    vi.useFakeTimers();
    const yapyap = api([]);
    render(<Downloads api={yapyap} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Nothing downloaded yet in this session.')).toBeTruthy();
    yapyap.downloads.list.mockResolvedValue([entry({ name: 'new.pdf', state: 'interrupted' })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
    });
    expect(screen.getByText('new.pdf')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    cleanup();
    const calls = yapyap.downloads.list.mock.calls.length;
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 2);
    expect(yapyap.downloads.list.mock.calls).toHaveLength(calls);
  });
});
