import { describe, expect, it, vi } from 'vitest';
import { recordTrace, TRACE_CATEGORIES } from './trace.ts';

function setup(options: { agree?: boolean; path?: string | undefined; failing?: boolean } = {}) {
  const order: string[] = [];
  const deps = {
    ask: vi.fn(() => Promise.resolve({ response: options.agree === false ? 1 : 0 })),
    chooseFile: vi.fn(() =>
      Promise.resolve(
        'path' in options
          ? { canceled: options.path === undefined, filePath: options.path ?? '' }
          : { canceled: false, filePath: '/home/user/yapyap.trace.json' },
      ),
    ),
    start: vi.fn(() => {
      order.push('start');
      return options.failing === true ? Promise.reject(new Error('busy')) : Promise.resolve();
    }),
    stop: vi.fn(() => {
      order.push('stop');
      return Promise.resolve();
    }),
    wait: vi.fn((ms: number) => {
      order.push(`wait ${String(ms)}`);
      return Promise.resolve();
    }),
    tell: vi.fn(),
    warn: vi.fn(),
  };
  return { deps, order };
}

describe('recordTrace', () => {
  it('records for ten seconds, then saves where the user chose', async () => {
    const t = setup();
    await recordTrace(t.deps);
    expect(t.order).toEqual(['start', 'wait 10000', 'stop']);
    expect(t.deps.start).toHaveBeenCalledWith(TRACE_CATEGORIES);
    expect(t.deps.ask).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Record a performance trace?', cancelId: 1 }),
    );
    expect(t.deps.stop).toHaveBeenCalledWith('/home/user/yapyap.trace.json');
    expect(t.deps.tell).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'info', message: 'The performance trace is saved.' }),
    );
  });

  it('records nothing unless the user agrees and picks a file', async () => {
    const declined = setup({ agree: false });
    await recordTrace(declined.deps);
    expect(declined.deps.chooseFile).not.toHaveBeenCalled();
    const cancelled = setup({ path: undefined });
    await recordTrace(cancelled.deps);
    expect(cancelled.order).toEqual([]);
    expect(cancelled.deps.tell).not.toHaveBeenCalled();
    const unnamed = setup();
    unnamed.deps.chooseFile.mockResolvedValueOnce({ canceled: false } as never);
    await recordTrace(unnamed.deps);
    expect(unnamed.order).toEqual([]);
  });

  it('says when recording fails', async () => {
    const t = setup({ failing: true });
    await recordTrace(t.deps);
    expect(t.deps.warn).toHaveBeenCalledWith('Could not record a performance trace.');
    expect(t.deps.tell).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'warning' }),
    );
  });

  it('leaves memory dumps and screenshots out', () => {
    expect(TRACE_CATEGORIES.some((category) => /memory|screenshot/.test(category))).toBe(false);
  });
});
