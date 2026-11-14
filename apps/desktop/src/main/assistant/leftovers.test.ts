import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { removeLeftovers } from './leftovers.ts';

describe('removeLeftovers', () => {
  it('deletes the private model’s downloads and record from the profile', async () => {
    const remove = vi.fn(() => Promise.resolve());
    const warn = vi.fn();
    await removeLeftovers('/profile', remove, warn);
    expect(remove.mock.calls).toEqual([
      [join('/profile', 'models'), { recursive: true, force: true }],
      [join('/profile', 'assistant.json'), { recursive: true, force: true }],
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('goes on past what it cannot remove, and says so in the log', async () => {
    const remove = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValueOnce(undefined);
    const warn = vi.fn();
    await removeLeftovers('/profile', remove, warn);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Could not remove the old models from the profile.',
    );
  });
});
