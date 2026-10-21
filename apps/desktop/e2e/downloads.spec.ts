import type { ElectronApplication, Page } from '@playwright/test';
import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

/** Points YapYap's downloads folder into the test profile. */
async function useDownloads(app: ElectronApplication, profile: string): Promise<string> {
  const folder = join(profile, 'Downloads');
  await mkdir(folder);
  await app.evaluate(({ app: electronApp }, path) => {
    electronApp.setPath('downloads', path);
  }, folder);
  return folder;
}

async function download(window: Page, name: string): Promise<void> {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.evaluate((suggested) => {
    const link = document.createElement('a');
    link.href = `/__download?name=${encodeURIComponent(suggested)}`;
    document.body.append(link);
    link.click();
  }, name);
}

test('saves an attachment into the downloads folder under a safe name', async ({
  app,
  window,
  profile,
}) => {
  const folder = await useDownloads(app, profile);
  await download(window, '../../escape.TXT');
  // Chromium cleans the server's suggestion before YapYap does; either way the
  // file lands inside the folder, with its extension and case intact.
  await expect.poll(() => readdir(folder)).toEqual([expect.stringMatching(/escape\.TXT$/)]);
  const [saved = ''] = await readdir(folder);
  expect(saved).not.toMatch(/[/\\]/);
  expect(await readFile(join(folder, saved), 'utf8')).toBe('attachment body');
  expect((await readdir(profile)).filter((name) => name.includes('escape'))).toEqual([]);
  expect((await readdir(join(profile, '..'))).filter((name) => name.includes('escape'))).toEqual(
    [],
  );
});

test('never writes through a symlink planted under the same name', async ({
  app,
  window,
  profile,
}) => {
  test.skip(process.platform === 'win32', 'creating symlinks needs extra rights on Windows');
  const folder = await useDownloads(app, profile);
  const outside = join(profile, 'outside.txt');
  await writeFile(outside, 'keep me');
  await symlink(outside, join(folder, 'report.txt'));
  await download(window, 'report.txt');
  await expect
    .poll(async () => (await readdir(folder)).sort())
    .toEqual(['report (1).txt', 'report.txt']);
  expect(await readFile(outside, 'utf8')).toBe('keep me');
});

test('renames a Windows device name instead of saving it', async ({ app, window, profile }) => {
  const folder = await useDownloads(app, profile);
  await download(window, 'CON.txt');
  await expect.poll(() => readdir(folder)).toEqual(['_CON.txt']);
});
