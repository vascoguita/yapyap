import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication } from '@playwright/test';
import {
  builtAssistant,
  openAssistantPanel,
  quietPort,
  standInKeyring,
} from './assistant-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';
import {
  assistantBarControls,
  assistantBarStatus,
  clickInBar,
  installExtension,
} from './extension-helpers.ts';

/** A tiny MIT-licensed GGUF model (see `test/models/LICENSE-stories260K.txt`). */
const MODEL = new URL('../test/models/stories260K.gguf', import.meta.url);

/** A model's file on a loopback port, as Hugging Face serves one: whole, or from a `Range`. */
interface ModelServer {
  readonly url: string;
  readonly port: number;
  /** The `Range` header of each request, or '' for none. */
  readonly ranges: string[];
  readonly close: () => void;
}

/**
 * Serves `bytes`, breaking off the first answer halfway as a dropped
 * connection would, so the assistant has to resume the download.
 */
async function modelServer(bytes: Buffer): Promise<ModelServer> {
  const ranges: string[] = [];
  const server = createServer((request, response) => {
    const range = request.headers.range ?? '';
    ranges.push(range);
    const start = Number(/^bytes=(\d+)-$/.exec(range)?.[1] ?? 0);
    response.writeHead(start > 0 ? 206 : 200, {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length - start),
      ...(start > 0
        ? {
            'content-range': `bytes ${String(start)}-${String(bytes.length - 1)}/${String(bytes.length)}`,
          }
        : {}),
    });
    if (ranges.length === 1) {
      // The first half arrives before the connection drops.
      response.write(bytes.subarray(0, bytes.length / 2), () => {
        setTimeout(() => response.destroy(), 500);
      });
      return;
    }
    response.end(bytes.subarray(start));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/stories260K.gguf`,
    port,
    ranges,
    close: () => server.close(),
  };
}

const SEARCH_PROMPT = 'Let AI assistant look for AI models on this computer?';

/** The bar's status line, once it says something matching `pattern`. */
const barSays = (app: ElectronApplication, pattern: RegExp, timeout = 30_000) =>
  expect.poll(() => assistantBarStatus(app), { timeout }).toMatch(pattern);

test('downloads, verifies and runs the private model in the assistant’s isolated page, resuming a broken download', async ({
  fakeWhatsApp,
  profile,
}) => {
  // Loading and running the model on the processor takes a while on a busy machine.
  test.setTimeout(180_000);
  const bytes = await readFile(MODEL);
  const server = await modelServer(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: {
      // No model server is found here, so the bar offers the private model.
      YAPYAP_TEST_MODEL_PORTS: String(await quietPort()),
      YAPYAP_TEST_BUILT_IN_MODEL: JSON.stringify({ url: server.url, size: bytes.length, sha256 }),
    },
  });
  try {
    await standInKeyring(app);
    const { manifest, main, others } = await builtAssistant();
    const allowServer = `Let AI assistant use the server at 127.0.0.1:${String(server.port)} on this computer?`;
    await installExtension(app, profile, manifest, main, others, [SEARCH_PROMPT, allowServer]);
    const window = await whatsAppPage(app);
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    await clickInBar(app, window, 'Find a model');
    await barSays(app, /^No AI model runs on this computer\. Use a private model on this computer/);
    // Nothing is downloaded before the user's click.
    expect(server.ranges).toEqual([]);
    await clickInBar(app, window, 'Use a private model');
    await barSays(app, /^The download stopped\. Check your connection, then resume: \d+%/);
    await clickInBar(app, window, 'Resume');
    await barSays(app, /^The private model is ready\./);
    // What came before the break is kept, and only the rest is asked for.
    expect(server.ranges).toEqual(['', expect.stringMatching(/^bytes=[1-9]\d*-$/)]);
    await clickInBar(app, window, 'Suggest replies');
    await barSays(app, /stay on this computer\. Allow it in this chat\?$/);
    await clickInBar(app, window, 'Allow here');
    // The tiny model writes nonsense, but writes it: the engine ran in the page.
    await expect
      .poll(async () => (await assistantBarControls(app))?.length ?? 0, { timeout: 90_000 })
      .toBeGreaterThan(2);
    expect(await assistantBarStatus(app)).toBe('');
    const panel = await openAssistantPanel(app);
    await expect(panel.getByRole('status')).toHaveText(
      'Using the private model on this computer. Ready.',
      { timeout: 20_000 },
    );
    await expect(panel.locator('#private-model')).toContainText('It uses about 1 MB');
    await panel.getByRole('button', { name: 'Remove model' }).click();
    await expect(panel.getByRole('status')).toHaveText(
      'Using Claude (Anthropic). Paste your API key to start.',
      { timeout: 20_000 },
    );
    await expect(panel.locator('#private-status')).toContainText('Use a private model');
  } finally {
    await closeApp(app);
    server.close();
  }
});
