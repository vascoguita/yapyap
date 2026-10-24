import { describe, expect, it, vi } from 'vitest';
import { lastFolderIn } from './last-folder.ts';

describe('lastFolderIn', () => {
  it('remembers the last folder in its file', () => {
    const write = vi.fn();
    const folder = lastFolderIn({ read: () => '{"lastFolder":"/home/someone/Travel"}', write });
    expect(folder.get()).toBe('/home/someone/Travel');
    folder.set('/home/someone/Work');
    expect(folder.get()).toBe('/home/someone/Work');
    expect(write).toHaveBeenCalledExactlyOnceWith('{"lastFolder":"/home/someone/Work"}');
  });

  it('knows no folder from a missing, broken or odd file', () => {
    for (const text of [undefined, '{', '{"lastFolder":7}']) {
      expect(lastFolderIn({ read: () => text, write: vi.fn() }).get()).toBeUndefined();
    }
  });
});
