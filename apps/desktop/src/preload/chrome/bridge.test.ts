import { describe, expect, it, vi } from 'vitest';
import { createChromeBridge } from './bridge.ts';

describe('createChromeBridge', () => {
  it('maps each operation to its own fixed channel', async () => {
    const info = { name: 'YapYap' };
    const invoke = vi.fn((channel: string) =>
      Promise.resolve(channel === 'about:info' ? info : 'ignored'),
    );
    const api = createChromeBridge(invoke);
    expect(await api.about.info()).toBe(info);
    await api.about.copyTechnicalDetails();
    expect(invoke.mock.calls).toEqual([['about:info'], ['about:copy-technical-details']]);
  });

  it('exposes nothing but the listed operations', () => {
    const api = createChromeBridge(vi.fn());
    expect(Object.keys(api)).toEqual(['about']);
    expect(Object.keys(api.about)).toEqual(['info', 'copyTechnicalDetails']);
  });
});
