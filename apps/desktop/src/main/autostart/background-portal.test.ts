import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeBus, type Emitted } from '../../../test/fake-bus.ts';
import {
  backgroundAsker,
  requestBackground,
  requestPath,
  requestToken,
  sessionBusPath,
} from './background-portal.ts';
import { variant, type Variant } from './dbus-codec.ts';
import { connectBus } from './dbus-client.ts';
import type { Message } from './dbus-message.ts';

const PATH = '/org/freedesktop/portal/desktop/request/1_42/yapyaptoken';

/** The portal's Response on the request's path, with `code` and the autostart it granted. */
const response = (code: number, autostart?: boolean, path = PATH): Emitted => ({
  path,
  interface: 'org.freedesktop.portal.Request',
  member: 'Response',
  signature: 'ua{sv}',
  body: [code, new Map(autostart === undefined ? [] : [['autostart', variant('b', autostart)]])],
});

/** A fake portal: AddMatch is fine, and RequestBackground is answered with `answers`. */
const portal = (answers: (call: Message) => readonly Emitted[]) =>
  fakeBus((call) =>
    call.member === 'RequestBackground'
      ? { reply: { body: [PATH], signature: 'o' }, signals: answers(call) }
      : { reply: { body: [], signature: '' } },
  );

describe('requestBackground', () => {
  it('asks for autostart with a reason and the command, and says what the portal granted', async () => {
    const t = portal(() => [response(0, true, '/elsewhere'), response(0, true)]);
    const bus = await connectBus(t.socket, 1000);
    const request = { autostart: true, reason: 'At login.', commandline: ['yapyap'] };
    expect(await requestBackground(bus, request, 'yapyaptoken')).toBe(true);
    const [, match, asked] = t.calls;
    expect(match).toMatchObject({ member: 'AddMatch' });
    expect(match?.body[0]).toContain(`path='${PATH}'`);
    expect(asked).toMatchObject({
      destination: 'org.freedesktop.portal.Desktop',
      path: '/org/freedesktop/portal/desktop',
      interface: 'org.freedesktop.portal.Background',
      member: 'RequestBackground',
      body: [
        '',
        new Map([
          ['handle_token', variant('s', 'yapyaptoken')],
          ['reason', variant('s', 'At login.')],
          ['autostart', variant('b', true)],
          ['commandline', variant('as', ['yapyap'])],
          ['dbus-activatable', variant('b', false)],
        ]),
      ],
    });
  });

  it('says no autostart when the portal grants none, and fails when the user refuses', async () => {
    const off = await connectBus(portal(() => [response(0)]).socket, 1000);
    expect(
      await requestBackground(
        off,
        { autostart: false, reason: 'r', commandline: [] },
        'yapyaptoken',
      ),
    ).toBe(false);
    const refused = await connectBus(portal(() => [response(1)]).socket, 1000);
    await expect(
      requestBackground(refused, { autostart: true, reason: 'r', commandline: [] }, 'yapyaptoken'),
    ).rejects.toThrow('The request to start at login was refused.');
  });
});

describe('request paths and tokens', () => {
  it('builds the path the portal answers on, and fresh tokens', () => {
    expect(requestPath(':1.42', 'token')).toBe(
      '/org/freedesktop/portal/desktop/request/1_42/token',
    );
    expect(requestToken()).toMatch(/^yapyap[0-9a-f]{16}$/);
    expect(requestToken()).not.toBe(requestToken());
  });
});

describe('sessionBusPath', () => {
  it('takes the first Unix socket the address names', () => {
    expect(sessionBusPath('unix:path=/run/flatpak/bus')).toBe('/run/flatpak/bus');
    expect(sessionBusPath('tcp:host=x,port=1;unix:abstract=/tmp/dbus-1,guid=00')).toBe(
      '\0/tmp/dbus-1',
    );
    expect(sessionBusPath('unix:guid=00;unix:path=/b')).toBe('/b');
    expect(() => sessionBusPath('')).toThrow('No session bus to reach the Background portal.');
  });
});

describe('backgroundAsker', () => {
  // The session bus, and the Flatpak it serves, are Linux's; Windows cannot listen on a socket path.
  it.skipIf(process.platform === 'win32')(
    'asks over a session bus of its own, and closes it after',
    async () => {
      const folder = mkdtempSync(join(tmpdir(), 'yapyap-bus-'));
      const address = join(folder, 'bus');
      let connected: Socket | undefined;
      const server = createServer((socket) => {
        connected = socket;
        const t = portal((call) => {
          const options = call.body[1] as ReadonlyMap<string, Variant>;
          const token = options.get('handle_token')?.value as string;
          return [response(0, true, `/org/freedesktop/portal/desktop/request/1_42/${token}`)];
        });
        t.socket.on('data', (bytes) => socket.write(bytes));
        // The handshake is lines of text until BEGIN; after it, the stream is messages.
        let handshake = true;
        let text = '';
        socket.on('data', (bytes) => {
          if (!handshake) {
            t.socket.write(Buffer.from(bytes));
            return;
          }
          text += bytes.toString('latin1');
          for (
            let end = text.indexOf('\r\n');
            end !== -1 && handshake;
            end = text.indexOf('\r\n')
          ) {
            const line = text.slice(0, end + 2);
            text = text.slice(end + 2);
            handshake = line !== 'BEGIN\r\n';
            t.socket.write(line);
          }
          if (!handshake && text.length > 0) {
            t.socket.write(Uint8Array.from(Buffer.from(text, 'latin1')));
          }
        });
      });
      await new Promise<void>((resolve) => server.listen(address, resolve));
      try {
        const ask = backgroundAsker(
          { env: { DBUS_SESSION_BUS_ADDRESS: `unix:path=${address}` }, getuid: () => 1000 },
          'At login.',
        );
        expect(await ask(true)).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(connected?.readableEnded ?? connected?.destroyed).toBe(true);
        const nobody = backgroundAsker({ env: {} }, 'At login.');
        await expect(nobody(true)).rejects.toThrow(
          'No session bus to reach the Background portal.',
        );
      } finally {
        server.close();
        rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});
