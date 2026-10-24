import { describe, expect, it, vi } from 'vitest';
import { createDownloadList, type TrackedItem } from './download-list.ts';

function item(state: ReturnType<TrackedItem['getState']>, overrides: Partial<TrackedItem> = {}) {
  return {
    getFilename: () => 'photo.jpg',
    getSavePath: () => '/home/someone/Downloads/photo.jpg',
    getReceivedBytes: () => 512,
    getTotalBytes: () => 2048,
    getState: () => state,
    isPaused: () => false,
    canResume: () => true,
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
}

describe('createDownloadList', () => {
  it('lists downloads newest first, paused ones as paused, named by their file', () => {
    const list = createDownloadList(vi.fn());
    list.add(item('completed'));
    list.add(item('progressing', { isPaused: () => true, getSavePath: () => '' }));
    expect(list.entries()).toEqual([
      { id: 2, name: 'photo.jpg', state: 'paused', received: 512, total: 2048, canResume: true },
      { id: 1, name: 'photo.jpg', state: 'completed', received: 512, total: 2048, canResume: true },
    ]);
  });

  it('pauses, resumes, cancels and shows only when the download allows it', () => {
    const show = vi.fn();
    const list = createDownloadList(show);
    const running = item('progressing');
    const paused = item('progressing', { isPaused: () => true });
    const stuck = item('interrupted', { canResume: () => false });
    const done = item('completed');
    for (const each of [running, paused, stuck, done]) {
      list.add(each);
    }
    expect(list.act(1, 'pause')).toBe(true);
    expect(running.pause).toHaveBeenCalledOnce();
    expect(list.act(1, 'resume')).toBe(false);
    expect(list.act(2, 'resume')).toBe(true);
    expect(paused.resume).toHaveBeenCalledOnce();
    expect(list.act(2, 'cancel')).toBe(true);
    expect(paused.cancel).toHaveBeenCalledOnce();
    expect(list.act(3, 'resume')).toBe(false);
    expect(list.act(3, 'show')).toBe(false);
    expect(list.act(4, 'show')).toBe(true);
    expect(show).toHaveBeenCalledExactlyOnceWith('/home/someone/Downloads/photo.jpg');
    expect(list.act(4, 'cancel')).toBe(false);
    expect(list.act(99, 'pause')).toBe(false);
  });

  it('clears what has ended and keeps what still runs', () => {
    const list = createDownloadList(vi.fn());
    list.add(item('completed'));
    list.add(item('progressing'));
    list.add(item('progressing', { isPaused: () => true }));
    list.add(item('cancelled'));
    list.add(item('interrupted'));
    list.clear();
    expect(list.entries().map((entry) => entry.id)).toEqual([3, 2]);
  });

  it('keeps the latest fifty', () => {
    const list = createDownloadList(vi.fn());
    for (let count = 0; count < 52; count += 1) {
      list.add(item('completed'));
    }
    const ids = list.entries().map((entry) => entry.id);
    expect(ids).toHaveLength(50);
    expect([ids[0], ids.at(-1)]).toEqual([52, 3]);
  });
});
