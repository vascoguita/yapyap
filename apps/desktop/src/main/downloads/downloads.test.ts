import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { downloadTarget, guardDownloads, type DownloadItem } from './downloads.ts';

const FOLDER = join('/home', 'someone', 'Downloads');

describe('downloadTarget', () => {
  it('saves a sanitized name directly inside the downloads folder', () => {
    expect(
      downloadTarget('../../.ssh/authorized_keys', { folder: () => FOLDER, taken: () => false }),
    ).toBe(join(FOLDER, 'authorized_keys'));
  });

  it('numbers the name rather than replacing anything already there', () => {
    const taken = new Set([join(FOLDER, 'photo.jpg'), join(FOLDER, 'photo (1).jpg')]);
    expect(
      downloadTarget('photo.jpg', { folder: () => FOLDER, taken: (path) => taken.has(path) }),
    ).toBe(join(FOLDER, 'photo (2).jpg'));
  });

  it('gives up after 99 copies', () => {
    const taken = vi.fn(() => true);
    expect(downloadTarget('photo.jpg', { folder: () => FOLDER, taken })).toBeUndefined();
    expect(taken).toHaveBeenCalledTimes(100);
  });
});

function setup(taken: (path: string) => boolean = () => false) {
  let willDownload: (event: unknown, item: DownloadItem) => void = () => undefined;
  const session = {
    on: vi.fn((_event: 'will-download', listener: typeof willDownload) => {
      willDownload = listener;
    }),
  };
  const deps = { folder: () => FOLDER, taken, notify: vi.fn(), warn: vi.fn() };
  guardDownloads(session, deps);
  const download = (name: string) => {
    let done: (event: unknown, state: string) => void = () => undefined;
    const item = {
      getFilename: () => name,
      setSavePath: vi.fn(),
      once: vi.fn((_event: 'done', listener: typeof done) => {
        done = listener;
      }),
    } satisfies DownloadItem;
    willDownload({}, item);
    return {
      item,
      finish: (state: string) => {
        done({}, state);
      },
    };
  };
  return { session, deps, download };
}

describe('guardDownloads', () => {
  it('saves into the downloads folder and says when the file is there', () => {
    const t = setup();
    const { item, finish } = t.download('Invoice.PDF');
    expect(item.setSavePath).toHaveBeenCalledExactlyOnceWith(join(FOLDER, 'Invoice.PDF'));
    expect(item.once).toHaveBeenCalledWith('done', expect.any(Function));
    finish('completed');
    expect(t.deps.notify).toHaveBeenCalledExactlyOnceWith(
      'Downloaded Invoice.PDF to your Downloads folder.',
    );
  });

  it('says when a download failed, and stays quiet when the user cancelled it', () => {
    const t = setup();
    t.download('a.zip').finish('interrupted');
    t.download('b.zip').finish('cancelled');
    expect(t.deps.notify).toHaveBeenCalledExactlyOnceWith('Could not download a.zip.');
  });

  it('falls back to asking when no safe target can be found or checked', () => {
    const full = setup(() => true);
    expect(full.download('photo.jpg').item.setSavePath).not.toHaveBeenCalled();
    const broken = setup(() => {
      throw new Error('EACCES');
    });
    expect(broken.download('photo.jpg').item.setSavePath).not.toHaveBeenCalled();
    expect(broken.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'Could not choose where to save a download; asking instead.',
    );
  });
});
