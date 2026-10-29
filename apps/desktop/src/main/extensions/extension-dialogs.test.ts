import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARCHIVE_LIMITS } from '@yapyap/extension-sign';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
}));
vi.mock('electron', () => ({
  dialog: { showOpenDialog: electron.showOpenDialog, showMessageBox: electron.showMessageBox },
}));

const { electronExtensionDialogs: dialogs } = await import('./extension-dialogs.ts');

describe('electronExtensionDialogs', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yapyap-extension-dialog-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('asks for one extension archive, and nothing when the user cancels', async () => {
    electron.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/a.yapyap-extension'],
    });
    await expect(dialogs.chooseArchive()).resolves.toBe('/a.yapyap-extension');
    expect(electron.showOpenDialog).toHaveBeenCalledWith({
      filters: [{ name: 'YapYap extensions', extensions: ['yapyap-extension'] }],
      properties: ['openFile'],
    });
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(dialogs.chooseArchive()).resolves.toBeUndefined();
  });

  it('reads an archive whole, but never past one byte over the limit', async () => {
    const small = join(dir, 'small.yapyap-extension');
    writeFileSync(small, Buffer.from([1, 2, 3]));
    expect([...(await dialogs.readFile(small))]).toEqual([1, 2, 3]);
    const large = join(dir, 'large.yapyap-extension');
    writeFileSync(large, Buffer.alloc(ARCHIVE_LIMITS.archiveBytes + 10));
    const read = await dialogs.readFile(large);
    expect(read).toHaveLength(ARCHIVE_LIMITS.archiveBytes + 1);
  });

  it('shows a message under YapYap’s name', () => {
    dialogs.showMessage({ type: 'error', message: 'Nope.', detail: 'Bad signature.' });
    expect(electron.showMessageBox).toHaveBeenCalledWith({
      type: 'error',
      title: 'YapYap',
      message: 'Nope.',
      detail: 'Bad signature.',
    });
  });

  it('asks before an extension reaches a new host, and denies by default', async () => {
    electron.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await expect(dialogs.askHost('Hello', 'api.example.org')).resolves.toBe(true);
    expect(electron.showMessageBox).toHaveBeenLastCalledWith({
      type: 'question',
      title: 'YapYap',
      message: 'Let Hello connect to api.example.org?',
      detail:
        'The extension wants to send data there and read the answer. Only allow a host you trust, such as a service you set up for this extension.',
      buttons: ['Allow', 'Deny'],
      defaultId: 1,
      cancelId: 1,
    });
    electron.showMessageBox.mockResolvedValueOnce({ response: 1 });
    await expect(dialogs.askHost('Hello', 'api.example.org')).resolves.toBe(false);
  });

  it('asks before an extension uses a server on this computer, and denies by default', async () => {
    electron.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await expect(dialogs.askLocal('Hello', 'localhost:11435')).resolves.toBe(true);
    expect(electron.showMessageBox).toHaveBeenLastCalledWith({
      type: 'question',
      title: 'YapYap',
      message: 'Let Hello use the server at localhost:11435 on this computer?',
      detail:
        'The extension could then use everything that server offers, such as a local AI model, and read its answers. Only allow a server you set up for this extension.',
      buttons: ['Allow', 'Deny'],
      defaultId: 1,
      cancelId: 1,
    });
    electron.showMessageBox.mockResolvedValueOnce({ response: 1 });
    await expect(dialogs.askLocal('Hello', 'localhost:11435')).resolves.toBe(false);
  });

  it('asks before removing an extension, and keeps it by default', async () => {
    electron.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await expect(dialogs.confirmRemove('Hello')).resolves.toBe(true);
    expect(electron.showMessageBox).toHaveBeenLastCalledWith({
      type: 'warning',
      title: 'YapYap',
      message: 'Remove Hello?',
      detail:
        'This stops the extension and deletes it, with its settings, its stored data and its saved secrets, such as API keys. Its past activity stays listed.',
      buttons: ['Remove Extension', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    electron.showMessageBox.mockResolvedValueOnce({ response: 1 });
    await expect(dialogs.confirmRemove('Hello')).resolves.toBe(false);
  });
});
