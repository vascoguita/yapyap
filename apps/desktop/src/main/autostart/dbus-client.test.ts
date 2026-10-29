import { describe, expect, it, vi } from 'vitest';
import { fakeBus } from '../../../test/fake-bus.ts';
import { connectBus } from './dbus-client.ts';
import { MessageType } from './dbus-message.ts';

const PING = {
  destination: 'org.example',
  path: '/org/example',
  interface: 'org.example.Thing',
  member: 'Ping',
};

describe('connectBus', () => {
  it('authenticates as the user, says Hello, and learns its unique name', async () => {
    const t = fakeBus(() => ({}));
    const written: unknown[] = [];
    const write = t.socket.write.bind(t.socket);
    t.socket.write = (data) => {
      written.push(typeof data === 'string' ? data : 'message');
      write(data);
    };
    const bus = await connectBus(t.socket, 1000);
    expect(bus.name).toBe(':1.42');
    // "1000" in hex: the bus compares it with the socket's own credentials.
    expect(written.slice(0, 3)).toEqual(['\0AUTH EXTERNAL 31303030\r\n', 'BEGIN\r\n', 'message']);
    expect(t.calls[0]).toMatchObject({ member: 'Hello', destination: 'org.freedesktop.DBus' });
    bus.close();
    expect(t.ended()).toBe(true);
  });

  it('refuses a bus that does not accept it', async () => {
    const t = fakeBus(() => ({}), 'REJECTED EXTERNAL\r\n');
    await expect(connectBus(t.socket, 1000)).rejects.toThrow(
      'The session bus refused to authenticate YapYap.',
    );
  });

  it('answers each call with its own reply, or its error', async () => {
    const t = fakeBus((call) => ({
      reply:
        call.member === 'Ping'
          ? { body: [call.body[0] ?? ''], signature: 's' }
          : { error: 'org.example.Error.Nope' },
    }));
    const bus = await connectBus(t.socket, 1000);
    const [one, two] = await Promise.all([
      bus.call({ ...PING, signature: 's', body: ['one'] }),
      bus.call({ ...PING, signature: 's', body: ['two'] }),
    ]);
    expect([one, two]).toEqual([['one'], ['two']]);
    await expect(bus.call({ ...PING, member: 'Other' })).rejects.toThrow('org.example.Error.Nope');
  });

  it('hands every signal to its listeners, and fails waiting calls when the bus closes', async () => {
    const t = fakeBus((call) =>
      call.member === 'Ping'
        ? {
            reply: { body: [], signature: '' },
            signals: [
              { path: '/org/example', interface: 'org.example.Thing', member: 'Pong', body: [] },
            ],
          }
        : {},
    );
    const bus = await connectBus(t.socket, 1000);
    const heard = vi.fn();
    bus.onSignal(heard);
    await bus.call(PING);
    await vi.waitFor(() => {
      expect(heard).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.signal, member: 'Pong' }),
      );
    });
    const waiting = bus.call({ ...PING, member: 'Silent' });
    t.close();
    await expect(waiting).rejects.toThrow('The session bus closed the connection.');
  });

  it('fails a call whose error has no name, and ignores replies to calls it never made', async () => {
    const t = fakeBus((call) => ({
      signals: [
        { type: MessageType.reply, replySerial: 999, body: [] },
        { type: MessageType.reply, body: [] },
        { type: MessageType.error, replySerial: call.serial, body: [] },
      ],
    }));
    const bus = await connectBus(t.socket, 1000);
    await expect(bus.call(PING)).rejects.toThrow('org.freedesktop.DBus.Error.Failed');
  });
});
