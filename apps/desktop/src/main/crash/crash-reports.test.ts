import { describe, expect, it, vi } from 'vitest';
import { crashIssueUrl } from './crash-report.ts';
import { trackCrashes, type CrashReviewChoice } from './crash-reports.ts';

const PREVIOUS = '{"version":"0.0.9","startedAt":1000}';

function setup(options: {
  marker?: string;
  setting?: 'off' | 'local' | 'ask';
  failing?: string[];
  savedAt?: number;
  dumps?: number;
  report?: string;
}) {
  const stored = new Map<string, string>([
    ...(options.marker === undefined ? [] : [['running.json', options.marker] as const]),
    ...(options.report === undefined ? [] : [['crash-report.txt', options.report] as const]),
  ]);
  const failing = new Set(options.failing ?? []);
  const files = {
    read: vi.fn((name: string) => stored.get(name)),
    write: vi.fn((name: string, text: string) => {
      if (failing.has(`write ${name}`)) {
        throw new Error('disk full');
      }
      stored.set(name, text);
    }),
    remove: vi.fn((name: string) => {
      if (failing.has(`remove ${name}`)) {
        throw new Error('busy');
      }
      stored.delete(name);
    }),
    modifiedAt: vi.fn((name: string) => (stored.has(name) ? (options.savedAt ?? 2000) : undefined)),
    clearDumps: vi.fn(() => {
      if (failing.has('clear dumps')) {
        throw new Error('busy');
      }
      return options.dumps ?? 0;
    }),
  };
  let quit: (() => void) | undefined;
  const deps = {
    files,
    version: '0.1.0',
    now: () => 2000,
    setting: () => options.setting ?? 'ask',
    onQuit: (listener: () => void) => {
      quit = listener;
    },
    warn: vi.fn(),
  };
  const review = {
    technicalDetails: () => 'YapYap 0.1.0 (deb)',
    previousLog: () => ['last line'],
    review: vi.fn<(report: string) => Promise<CrashReviewChoice>>(() => Promise.resolve('close')),
    openExternal: vi.fn(() => Promise.resolve()),
    writeClipboard: vi.fn(() => Promise.resolve()),
  };
  return { stored, deps, review, quit: () => quit?.() };
}

describe('trackCrashes', () => {
  it('marks this session as running and clears the mark on a clean quit', async () => {
    const t = setup({});
    const afterReady = trackCrashes(t.deps);
    expect(t.stored.get('running.json')).toBe('{"version":"0.1.0","startedAt":2000}');
    await afterReady(t.review);
    expect(t.review.review).not.toHaveBeenCalled();
    t.quit();
    expect(t.stored.has('running.json')).toBe(false);
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('saves a report and offers a review after an unclean exit', async () => {
    const t = setup({ marker: PREVIOUS });
    const afterReady = trackCrashes(t.deps);
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'The previous session did not end cleanly.',
    );
    expect(t.review.review).not.toHaveBeenCalled();
    await afterReady(t.review);
    const report = t.stored.get('crash-report.txt');
    expect(report).toMatch(
      /^YapYap closed unexpectedly\.\nFingerprint: [0-9a-f]{12}\nPrevious session: YapYap 0\.0\.9, [\s\S]*YapYap 0\.1\.0 \(deb\)[\s\S]*\nlast line$/,
    );
    expect(t.review.review).toHaveBeenCalledExactlyOnceWith(report);
    expect(t.review.openExternal).not.toHaveBeenCalled();
    expect(t.review.writeClipboard).not.toHaveBeenCalled();
  });

  it('opens a prefilled issue when the user chooses to report it', async () => {
    const t = setup({ marker: PREVIOUS });
    t.review.review.mockResolvedValueOnce('report');
    await trackCrashes(t.deps)(t.review);
    expect(t.review.openExternal).toHaveBeenCalledExactlyOnceWith(
      crashIssueUrl(t.stored.get('crash-report.txt') ?? ''),
    );
  });

  it('copies the report when the user chooses to', async () => {
    const t = setup({ marker: PREVIOUS });
    t.review.review.mockResolvedValueOnce('copy');
    await trackCrashes(t.deps)(t.review);
    expect(t.review.writeClipboard).toHaveBeenCalledExactlyOnceWith(
      t.stored.get('crash-report.txt'),
    );
  });

  it('only saves the report when crash reports are local', async () => {
    const t = setup({ marker: PREVIOUS, setting: 'local' });
    await trackCrashes(t.deps)(t.review);
    expect(t.stored.has('crash-report.txt')).toBe(true);
    expect(t.review.review).not.toHaveBeenCalled();
  });

  it('keeps nothing when crash reports are off, the default', async () => {
    const t = setup({ marker: PREVIOUS, setting: 'off' });
    await trackCrashes(t.deps)(t.review);
    expect(t.stored.has('crash-report.txt')).toBe(false);
    expect(t.review.review).not.toHaveBeenCalled();
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('treats an unreadable marker as a clean exit', async () => {
    const t = setup({ marker: 'garbage' });
    await trackCrashes(t.deps)(t.review);
    expect(t.review.review).not.toHaveBeenCalled();
  });

  it('logs files it cannot write or remove, and still offers the review', async () => {
    const t = setup({
      marker: PREVIOUS,
      failing: ['write running.json', 'write crash-report.txt', 'remove running.json'],
    });
    await trackCrashes(t.deps)(t.review);
    t.quit();
    expect(t.deps.warn.mock.calls).toEqual([
      ['Could not record that YapYap is running.'],
      ['The previous session did not end cleanly.'],
      ['Could not save the crash report.'],
      ['Could not record that YapYap quit cleanly.'],
    ]);
    expect(t.review.review).toHaveBeenCalledOnce();
  });

  it('forgets a report older than 30 days, and keeps a newer one', () => {
    const day = 24 * 60 * 60 * 1000;
    const old = setup({ report: 'old', savedAt: 2000 - 31 * day });
    trackCrashes(old.deps);
    expect(old.stored.has('crash-report.txt')).toBe(false);
    const recent = setup({ report: 'recent', savedAt: 2000 - 29 * day });
    trackCrashes(recent.deps);
    expect(recent.stored.get('crash-report.txt')).toBe('recent');
    const none = setup({});
    trackCrashes(none.deps);
    expect(none.deps.files.remove).not.toHaveBeenCalledWith('crash-report.txt');
  });

  it('removes memory dumps Chromium left behind, and says how many', () => {
    const t = setup({ dumps: 2 });
    trackCrashes(t.deps);
    expect(t.deps.files.clearDumps).toHaveBeenCalledOnce();
    expect(t.deps.warn).toHaveBeenCalledWith('Removed 2 crash dumps, which can hold messages.');
    const clean = setup({});
    trackCrashes(clean.deps);
    expect(clean.deps.warn).not.toHaveBeenCalled();
    const failing = setup({ failing: ['clear dumps'] });
    trackCrashes(failing.deps);
    expect(failing.deps.warn).toHaveBeenCalledWith('Could not remove old crash files.');
  });
});
