import { describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID, runInAdapterWorld } from './world.ts';

describe('runInAdapterWorld', () => {
  it('runs the code in the adapter’s own world and hands back what it returns', async () => {
    const page = { executeJavaScriptInIsolatedWorld: vi.fn(() => Promise.resolve(true)) };
    await expect(runInAdapterWorld(page, '1 + 1')).resolves.toBe(true);
    expect(page.executeJavaScriptInIsolatedWorld).toHaveBeenCalledExactlyOnceWith(
      ADAPTER_WORLD_ID,
      [{ code: '1 + 1' }],
    );
    expect(ADAPTER_WORLD_ID).toBe(1000);
  });
});
