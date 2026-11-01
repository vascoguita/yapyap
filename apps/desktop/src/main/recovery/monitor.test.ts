import { describe, expect, it, vi } from 'vitest';
import { PAGE_HEALTH_PROBE } from '../../adapter/page-health.ts';
import { ADAPTER_WORLD_ID } from '../../adapter/world.ts';
import { HEALTH_CHECK_MS, monitorPage, type MonitoredContents } from './monitor.ts';

type Listener = (...args: never[]) => void;

function setup(
  probeResult: Promise<unknown> = Promise.resolve({ unsupported: false, blank: false }),
) {
  const handlers = new Map<string, Listener>();
  const contents = {
    on: vi.fn((event: string, listener: Listener) => {
      handlers.set(event, listener);
    }),
    executeJavaScriptInIsolatedWorld: vi.fn(() => probeResult),
  } satisfies MonitoredContents;
  const scheduled: { callback: () => void; ms: number }[] = [];
  const deps = {
    onFailure: vi.fn(),
    schedule: vi.fn((callback: () => void, ms: number) => scheduled.push({ callback, ms })),
    warn: vi.fn(),
  };
  monitorPage(contents, deps);
  const fire = (event: string, ...args: unknown[]): void => {
    handlers.get(event)?.(...(args as never[]));
  };
  return { contents, deps, scheduled, fire };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('monitorPage', () => {
  it('reports main-frame load failures right away', () => {
    const t = setup();
    t.fire('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://web.whatsapp.com/', true);
    t.fire('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://web.whatsapp.com/', true);
    expect(t.deps.onFailure.mock.calls).toEqual([
      [{ kind: 'load-failed', code: -105, description: 'ERR_NAME_NOT_RESOLVED' }],
    ]);
  });

  it('checks the page in the adapter world a while after it loads', async () => {
    const t = setup(Promise.resolve({ unsupported: true, blank: false }));
    t.fire('did-finish-load');
    expect(t.scheduled.map(({ ms }) => ms)).toEqual([HEALTH_CHECK_MS]);
    expect(t.contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    t.scheduled[0]?.callback();
    await settle();
    expect(t.contents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledExactlyOnceWith(
      ADAPTER_WORLD_ID,
      [{ code: PAGE_HEALTH_PROBE }],
    );
    expect(t.deps.onFailure).toHaveBeenCalledExactlyOnceWith({ kind: 'unsupported' });
  });

  it.each([[{ unsupported: false, blank: false }], [{ unexpected: true }]])(
    'stays quiet for a healthy page or an unexpected answer (%j)',
    async (result) => {
      const t = setup(Promise.resolve(result));
      t.fire('did-finish-load');
      t.scheduled[0]?.callback();
      await settle();
      expect(t.deps.onFailure).not.toHaveBeenCalled();
    },
  );

  it('logs a check that could not run', async () => {
    const t = setup(Promise.reject(new Error('destroyed')));
    t.fire('did-finish-load');
    t.scheduled[0]?.callback();
    await settle();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith('Could not check the WhatsApp page.');
    expect(t.deps.onFailure).not.toHaveBeenCalled();
  });
});
