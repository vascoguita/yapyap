import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { downloadsFolder, downloadTarget, guardDownloads, type DownloadItem } from './downloads.ts';

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

function setup(
  taken: (path: string) => boolean = () => false,
  options: { askWhere?: boolean; openWhenDone?: boolean; folder?: string } = {},
) {
  let willDownload: (event: unknown, item: DownloadItem) => void = () => undefined;
  const session = {
    on: vi.fn((_event: 'will-download', listener: typeof willDownload) => {
      willDownload = listener;
    }),
  };
  let last: string | undefined;
  const deps = {
    folder: () => FOLDER,
    taken,
    notify: vi.fn(),
    warn: vi.fn(),
    options: () => ({ askWhere: false, openWhenDone: false, folder: '', ...options }),
    lastFolder: {
      get: () => last,
      set: vi.fn((folder: string) => {
        last = folder;
      }),
    },
    openPath: vi.fn<(path: string) => Promise<string>>(() => Promise.resolve('')),
    track: vi.fn(),
  };
  guardDownloads(session, deps);
  const download = (name: string, chosen = join(FOLDER, name)) => {
    let done: (event: unknown, state: string) => void = () => undefined;
    let savePath = chosen;
    const item = {
      getFilename: () => name,
      getSavePath: () => savePath,
      setSavePath: vi.fn((path: string) => {
        savePath = path;
      }),
      setSaveDialogOptions: vi.fn(),
      getReceivedBytes: () => 0,
      getTotalBytes: () => 0,
      getState: () => 'progressing' as const,
      isPaused: () => false,
      canResume: () => false,
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
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
    expect(t.deps.track).toHaveBeenCalledExactlyOnceWith(item);
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

describe('download options', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('asks where to save, starting where the user last saved, and remembers the folder', () => {
    const t = setup(undefined, { askWhere: true });
    const first = t.download('Ticket.pdf', '/home/someone/Travel/Ticket.pdf');
    expect(first.item.setSavePath).not.toHaveBeenCalled();
    expect(first.item.setSaveDialogOptions).toHaveBeenCalledWith({
      defaultPath: join(FOLDER, 'Ticket.pdf'),
    });
    first.finish('completed');
    expect(t.deps.notify).toHaveBeenCalledWith('Saved Ticket.pdf.');
    expect(t.deps.lastFolder.set).toHaveBeenCalledWith('/home/someone/Travel');
    const second = t.download('Map.png');
    expect(second.item.setSaveDialogOptions).toHaveBeenCalledWith({
      defaultPath: join('/home/someone/Travel', 'Map.png'),
    });
  });

  it('offers just the name when no folder can be found', () => {
    const t = setup(undefined, { askWhere: true });
    t.deps.folder = () => {
      throw new Error('ENOENT');
    };
    expect(t.download('a.txt').item.setSaveDialogOptions).toHaveBeenCalledWith({
      defaultPath: 'a.txt',
    });
  });

  it('opens finished files that only display, and never ones that could run', async () => {
    const t = setup(undefined, { openWhenDone: true });
    t.download('Invoice.PDF').finish('completed');
    t.download('setup.exe').finish('completed');
    t.download('tool.AppImage').finish('completed');
    t.download('late.pdf').finish('interrupted');
    expect(t.deps.openPath).toHaveBeenCalledExactlyOnceWith(join(FOLDER, 'Invoice.PDF'));
    t.deps.openPath.mockResolvedValueOnce('No application.');
    t.download('photo.jpg').finish('completed');
    await settle();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith('Could not open a download.');
  });

  it('opens nothing unless asked to', () => {
    const t = setup();
    t.download('Invoice.pdf').finish('completed');
    expect(t.deps.openPath).not.toHaveBeenCalled();
  });
});

describe('downloadsFolder', () => {
  const fs = (folders: readonly string[]) => ({
    realpath: (path: string) => {
      if (path.includes('gone')) {
        throw new Error('ENOENT');
      }
      return `/real${path}`;
    },
    isFolder: (path: string) => folders.includes(path),
  });

  it('uses the chosen folder, else the Downloads folder', () => {
    const system = () => '/home/someone/Downloads';
    expect(downloadsFolder('/home/someone/Saved', system, fs(['/real/home/someone/Saved']))).toBe(
      '/real/home/someone/Saved',
    );
    expect(downloadsFolder('', system, fs([]))).toBe('/real/home/someone/Downloads');
    expect(downloadsFolder('/home/someone/gone', system, fs([]))).toBe(
      '/real/home/someone/Downloads',
    );
    expect(downloadsFolder('/home/someone/notes.txt', system, fs([]))).toBe(
      '/real/home/someone/Downloads',
    );
  });

  it('names the folder only when it is the Downloads folder', () => {
    const t = setup(undefined, { folder: '/home/someone/Saved' });
    t.download('a.pdf').finish('completed');
    expect(t.deps.notify).toHaveBeenCalledExactlyOnceWith('Saved a.pdf.');
  });
});
