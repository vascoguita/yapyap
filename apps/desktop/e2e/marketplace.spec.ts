import { generateKeyPairSync, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signIndex } from '@yapyap/plugin-sign';
import { signedArchive, testKey, testManifest, zipArchive } from '../test/plugins.ts';
import { closeApp, expect, launchApp, test } from './fixtures.ts';
import { chromePage, clickMenu } from './plugin-helpers.ts';

/** A local marketplace: a signed index listing one reviewed plugin, and its archive. */
async function fakeMarketplace(): Promise<{ origin: string; anchor: string; server: Server }> {
  const author = testKey();
  const archive = zipArchive(signedArchive(author, testManifest()));
  const indexKey = generateKeyPairSync('ed25519');
  const now = Date.now();
  const index = new TextEncoder().encode(
    JSON.stringify({
      format: 1,
      serial: Math.floor(now / 1000),
      generated: new Date(now - 60_000).toISOString(),
      expires: new Date(now + 86_400_000).toISOString(),
      plugins: [
        {
          id: 'org.example.hello',
          name: 'Hello',
          summary: 'Says hello in your drafts.',
          author: { name: 'Example Author' },
          homepage: 'https://example.org/hello',
          license: 'MIT',
          review: 'reviewed',
          signer: author.fingerprint,
          versions: [
            {
              version: '1.0.0',
              size: archive.length,
              sha256: `sha256-${createHash('sha256').update(archive).digest('base64')}`,
              capabilities: ['composer:insert-draft'],
              hosts: ['api.example.org'],
              minYapYap: '0.0.1',
              published: new Date(now - 60_000).toISOString(),
            },
          ],
        },
      ],
      revoked: [],
    }),
  );
  const files = new Map<string, Uint8Array>([
    ['/plugins/index.json', index],
    ['/plugins/index.json.sig', new TextEncoder().encode(signIndex(index, indexKey.privateKey))],
    ['/plugins/org.example.hello/org.example.hello-1.0.0.yapyap-plugin', archive],
  ]);
  const server = createServer((request, response) => {
    const body = files.get(request.url ?? '');
    response.writeHead(body === undefined ? 404 : 200).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    anchor: indexKey.publicKey.export({ format: 'pem', type: 'spki' }),
    server,
  };
}

test('installs a reviewed plugin from the marketplace, through the usual consent', async ({
  fakeWhatsApp,
  profile,
}) => {
  const marketplace = await fakeMarketplace();
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: {
      YAPYAP_TEST_MARKETPLACE_ORIGIN: marketplace.origin,
      YAPYAP_TEST_MARKETPLACE_ANCHOR: marketplace.anchor,
    },
  });
  try {
    await clickMenu(app, 'Plugins…');
    const plugins = await chromePage(app, '/plugins.html');
    await plugins.getByRole('tab', { name: 'Marketplace' }).click();
    await expect(plugins.getByRole('heading', { name: 'Hello' })).toBeVisible();
    await expect(plugins.getByText('Third-party, reviewed by YapYap')).toBeVisible();
    await plugins.getByRole('button', { name: 'Install Hello' }).click();
    const consent = await chromePage(app, '/plugin-consent.html');
    await expect(consent.getByText(/YapYap reviewed this version/)).toBeVisible();
    const install = consent.getByRole('button', { name: 'Install' });
    // A reviewed plugin needs no acknowledgement of risk, unlike one from a file.
    await expect(install).toBeEnabled();
    await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
    await expect(plugins.getByText('Installed', { exact: true }).last()).toBeVisible();
    await plugins.getByRole('tab', { name: 'Installed' }).click();
    await expect(plugins.getByText('org.example.hello')).toBeVisible();
  } finally {
    await closeApp(app);
    marketplace.server.close();
  }
});

test('shows nothing it cannot verify', async ({ fakeWhatsApp, profile }) => {
  const marketplace = await fakeMarketplace();
  const stranger = generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' });
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: {
      YAPYAP_TEST_MARKETPLACE_ORIGIN: marketplace.origin,
      YAPYAP_TEST_MARKETPLACE_ANCHOR: stranger,
    },
  });
  try {
    await clickMenu(app, 'Plugins…');
    const plugins = await chromePage(app, '/plugins.html');
    await plugins.getByRole('tab', { name: 'Marketplace' }).click();
    await expect(plugins.getByRole('alert')).toHaveText(/could not verify/);
    await expect(plugins.getByRole('heading', { name: 'Hello' })).toHaveCount(0);
  } finally {
    await closeApp(app);
    marketplace.server.close();
  }
});
