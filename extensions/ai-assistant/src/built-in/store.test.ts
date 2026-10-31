import { describe, expect, it } from 'vitest';
import { memoryFileSystem } from '../testing/opfs.ts';
import { browserStore } from './store.ts';

const SHA = 'a'.repeat(64);
const bytes = (...values: number[]) => new Uint8Array(values);

describe('browserStore', () => {
  it('keeps each piece as a file of its own, and gives them back in order', async () => {
    const files = memoryFileSystem();
    const store = browserStore(files);
    await expect(store.pieces(SHA)).resolves.toEqual([]);
    for (let index = 0; index < 11; index += 1) {
      await store.save(SHA, index, [bytes(index), bytes(index)]);
    }
    const pieces = await store.pieces(SHA);
    expect(pieces).toHaveLength(11);
    const read = await Promise.all(
      pieces.map(async (piece) => [...new Uint8Array(await piece.arrayBuffer())]),
    );
    expect(read[2]).toEqual([2, 2]);
    expect(read[10]).toEqual([10, 10]);
    await expect(store.used()).resolves.toBe(22);
  });

  it('deletes one model, or every model, and finds nothing to delete without complaint', async () => {
    const store = browserStore(memoryFileSystem());
    await store.clear(SHA);
    await store.clearAll();
    await expect(store.used()).resolves.toBe(0);
    await store.save(SHA, 0, [bytes(1)]);
    await store.save('b'.repeat(64), 0, [bytes(1, 2)]);
    await store.clear(SHA);
    await expect(store.pieces(SHA)).resolves.toEqual([]);
    await expect(store.used()).resolves.toBe(2);
    await store.clearAll();
    await expect(store.used()).resolves.toBe(0);
  });

  it('says how much room is left when the browser says, and refuses a piece past it', async () => {
    const files = memoryFileSystem(3);
    const store = browserStore(files);
    await expect(store.free()).resolves.toBe(3);
    await store.save(SHA, 0, [bytes(1, 2)]);
    await expect(store.free()).resolves.toBe(1);
    await expect(store.save(SHA, 1, [bytes(1, 2)])).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    await expect(browserStore(memoryFileSystem()).free()).resolves.toBeUndefined();
    const unsized = browserStore({ ...files, estimate: () => Promise.resolve({ quota: 9 }) });
    await expect(unsized.free()).resolves.toBe(9);
  });

  it('passes on any failure but a missing folder', async () => {
    const broken = browserStore({
      getDirectory: () => Promise.reject(new DOMException('No access.', 'SecurityError')),
      estimate: () => Promise.resolve({}),
    });
    await expect(broken.pieces(SHA)).rejects.toMatchObject({ name: 'SecurityError' });
    await expect(broken.clearAll()).rejects.toMatchObject({ name: 'SecurityError' });
  });
});
