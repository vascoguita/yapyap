import type { ElectronApplication } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeApp, expect, launchApp, test } from './fixtures.ts';

/**
 * A proxy that refuses everything and remembers where it was asked to go.
 * Chromium sends all non-loopback traffic through it, its own background
 * requests included, so anything leaving the machine shows up here.
 */
async function startTrap(): Promise<{
  origin: string;
  hosts: string[];
  close: () => Promise<void>;
}> {
  const hosts: string[] = [];
  const server: Server = createServer((request, response) => {
    hosts.push(new URL(request.url ?? '', 'http://unknown').host);
    response.writeHead(403).end();
  });
  server.on('connect', (request, socket) => {
    hosts.push(request.url ?? 'unknown');
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    hosts,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** Records every request any YapYap session completes, by URL scheme and origin only. */
async function recordRequests(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, session, webContents }) => {
    const seen: string[] = [];
    Object.assign(globalThis, { seenRequests: seen });
    const watch = (target: Electron.Session) => {
      target.webRequest.onCompleted((details) => {
        const url = new URL(details.url);
        seen.push(
          url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol,
        );
      });
    };
    const sessions = new Set([
      session.defaultSession,
      ...webContents.getAllWebContents().map((c) => c.session),
    ]);
    for (const target of sessions) {
      watch(target);
    }
    electronApp.on('session-created', watch);
  });
}

async function openFromMenu(app: ElectronApplication, label: string): Promise<void> {
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
  await (await opened).waitForLoadState();
}

test('talks to nothing but WhatsApp during a session', async ({ fakeWhatsApp, profile }) => {
  test.setTimeout(90_000);
  const trap = await startTrap();
  // Loopback is exempt from proxies by default, which keeps the fake page reachable.
  const app = await launchApp(fakeWhatsApp.origin, profile, [`--proxy-server=${trap.origin}`]);
  try {
    await recordRequests(app);
    const window = await app.firstWindow();
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    await window.reload();
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    await openFromMenu(app, 'About YapYap');
    await openFromMenu(app, 'Settings…');
    // Long enough for start-up checks, update pings or beacons to fire.
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    expect(trap.hosts).toEqual([]);
    const seen = await app.evaluate(
      () => (globalThis as unknown as { seenRequests: string[] }).seenRequests,
    );
    expect(seen).toContain(fakeWhatsApp.origin);
    expect(new Set(seen)).toEqual(
      new Set(
        seen.filter((origin) => [fakeWhatsApp.origin, 'app:', 'data:', 'blob:'].includes(origin)),
      ),
    );
  } finally {
    await closeApp(app);
    await trap.close();
  }
});
