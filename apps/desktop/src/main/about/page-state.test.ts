import { describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import { PAGE_STATE_PROBE } from '../../adapter/page-state.ts';
import { readPageState } from './page-state.ts';

describe('readPageState', () => {
  it('runs the probe in the adapter world and keeps a valid result', async () => {
    const contents = {
      executeJavaScriptInIsolatedWorld: vi.fn(() =>
        Promise.resolve({ view: 'chats', chatOpen: false, unread: 1 }),
      ),
    };
    await expect(readPageState(contents)).resolves.toEqual({
      view: 'chats',
      chatOpen: false,
      unread: 1,
    });
    expect(contents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledExactlyOnceWith(
      ADAPTER_WORLD_ID,
      [{ code: PAGE_STATE_PROBE }],
    );
  });

  it('reads an unexpected result as undefined', async () => {
    const contents = { executeJavaScriptInIsolatedWorld: () => Promise.resolve('<html>') };
    await expect(readPageState(contents)).resolves.toBeUndefined();
  });

  it('reads a failed probe as undefined', async () => {
    const contents = { executeJavaScriptInIsolatedWorld: () => Promise.reject(new Error('gone')) };
    await expect(readPageState(contents)).resolves.toBeUndefined();
  });
});
