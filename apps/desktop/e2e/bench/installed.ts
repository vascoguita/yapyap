import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';
import type { ElectronApplication } from '@playwright/test';
import { builtExtension, installExtension } from '../extension-helpers.ts';
import { closeApp, expect, launchApp, whatsAppPage } from '../fixtures.ts';

/** Whether **Extension Commands** lists `label`, without running it. */
const listed = (app: ElectronApplication, label: string): Promise<boolean> =>
  app.evaluate(
    ({ Menu }, wanted) =>
      Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Extension Commands')
        ?.submenu?.items.some((entry) => entry.label === wanted) === true,
    label,
  );

/**
 * Installs the first-party extensions YapYap ships besides the assistant, as
 * `pnpm build` bundles them, through the install window, and returns the
 * profile's `extensions` folder for each measured launch to copy.
 */
export async function installedFirstParty(): Promise<string> {
  const fake = await startFakeWhatsApp();
  const profile = await mkdtemp(join(tmpdir(), 'yapyap-bench-extensions-'));
  const app = await launchApp(fake.origin, profile);
  try {
    await (await whatsAppPage(app)).getByTestId('fake-whatsapp').waitFor({ state: 'visible' });
    for (const [folder, id, command] of [
      ['example', 'org.example.greeter', 'Greeter: Draft a greeting'],
      ['call-recorder', 'org.example.call-recorder', 'Call recorder: Stop recording'],
    ] as const) {
      const { manifest, main, others } = await builtExtension(folder, id);
      await installExtension(app, profile, manifest, main, others);
      await expect.poll(() => listed(app, command), { timeout: 20_000 }).toBe(true);
    }
  } finally {
    await closeApp(app);
    await fake.close();
  }
  return join(profile, 'extensions');
}
