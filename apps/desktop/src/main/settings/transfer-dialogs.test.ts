import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  fromWebContents: vi.fn<(contents: unknown) => object | null>(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(),
}));
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: electron.fromWebContents },
  dialog: {
    showSaveDialog: electron.showSaveDialog,
    showOpenDialog: electron.showOpenDialog,
    showMessageBox: electron.showMessageBox,
  },
}));

const { chooseFolder, electronSettingsFiles: files } = await import('./transfer-dialogs.ts');
const { MAX_IMPORT_BYTES } = await import('./transfer.ts');

const FILTERS = [{ name: 'YapYap settings', extensions: ['json'] }];
const owner = {};
const window = {};

describe('electronSettingsFiles', () => {
  let dir: string;

  beforeEach(() => {
    vi.resetAllMocks();
    electron.fromWebContents.mockReturnValue(window);
    dir = mkdtempSync(join(tmpdir(), 'yapyap-transfer-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('asks where to export, over the settings window', async () => {
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/home/me/s.json' });
    expect(await files.chooseExport(owner)).toBe('/home/me/s.json');
    expect(electron.fromWebContents).toHaveBeenCalledWith(owner);
    expect(electron.showSaveDialog).toHaveBeenCalledExactlyOnceWith(window, {
      defaultPath: 'yapyap-settings.json',
      filters: FILTERS,
    });
  });

  it('treats a cancelled or empty export choice as a cancel', async () => {
    electron.showSaveDialog
      .mockResolvedValueOnce({ canceled: true, filePath: '/home/me/s.json' })
      .mockResolvedValueOnce({ canceled: false, filePath: '' });
    expect(await files.chooseExport(owner)).toBeUndefined();
    expect(await files.chooseExport(owner)).toBeUndefined();
  });

  it('asks which file to import, one file at a time', async () => {
    electron.showOpenDialog
      .mockResolvedValueOnce({ canceled: false, filePaths: ['/home/me/s.json'] })
      .mockResolvedValueOnce({ canceled: true, filePaths: ['/home/me/s.json'] });
    expect(await files.chooseImport(owner)).toBe('/home/me/s.json');
    expect(await files.chooseImport(owner)).toBeUndefined();
    expect(electron.showOpenDialog).toHaveBeenCalledWith(window, {
      filters: FILTERS,
      properties: ['openFile'],
    });
  });

  it('confirms an import with Cancel as the default and Escape answer', async () => {
    electron.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 1 });
    expect(await files.confirmImport(owner, 'Your current settings will be replaced.')).toBe(true);
    expect(await files.confirmImport(owner, 'Again.')).toBe(false);
    expect(electron.showMessageBox).toHaveBeenCalledWith(window, {
      type: 'question',
      title: 'YapYap',
      message: 'Import these settings?',
      detail: 'Your current settings will be replaced.',
      buttons: ['Import', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
  });

  it('asks for a folder, where new ones can be made', async () => {
    electron.showOpenDialog
      .mockResolvedValueOnce({ canceled: false, filePaths: ['/home/me/Saved'] })
      .mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await chooseFolder(owner)).toBe('/home/me/Saved');
    expect(await chooseFolder(owner)).toBeUndefined();
    expect(electron.showOpenDialog).toHaveBeenCalledWith(window, {
      properties: ['openDirectory', 'createDirectory'],
    });
    electron.fromWebContents.mockReturnValueOnce(null);
    expect(await chooseFolder(owner)).toBeUndefined();
  });

  it('asks nothing without a window to ask over', async () => {
    electron.fromWebContents.mockReturnValue(null);
    expect(await files.chooseExport(owner)).toBeUndefined();
    expect(await files.chooseImport(owner)).toBeUndefined();
    expect(await files.confirmImport(owner, 'Detail.')).toBe(false);
    expect(electron.showSaveDialog).not.toHaveBeenCalled();
    expect(electron.showOpenDialog).not.toHaveBeenCalled();
    expect(electron.showMessageBox).not.toHaveBeenCalled();
  });

  it('writes and reads back a file', async () => {
    const path = join(dir, 'settings.json');
    await files.write(path, '{"format":"yapyap-settings"} é\n');
    expect(readFileSync(path, 'utf8')).toBe('{"format":"yapyap-settings"} é\n');
    expect(await files.read(path)).toBe('{"format":"yapyap-settings"} é\n');
  });

  it('reads only one byte past the limit of a huge file', async () => {
    const path = join(dir, 'huge.json');
    writeFileSync(path, 'x'.repeat(MAX_IMPORT_BYTES * 3));
    expect(await files.read(path)).toHaveLength(MAX_IMPORT_BYTES + 1);
  });

  it('fails to read a file that does not exist', async () => {
    await expect(files.read(join(dir, 'missing.json'))).rejects.toThrow(/ENOENT/);
  });
});
