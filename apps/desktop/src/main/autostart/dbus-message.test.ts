import { describe, expect, it } from 'vitest';
import { variant } from './dbus-codec.ts';
import { decode, encode, messageLength, MessageType } from './dbus-message.ts';

const CALL = {
  type: MessageType.call,
  serial: 7,
  path: '/org/freedesktop/portal/desktop',
  interface: 'org.freedesktop.portal.Background',
  member: 'RequestBackground',
  destination: 'org.freedesktop.portal.Desktop',
  signature: 'sa{sv}',
  body: ['', new Map([['autostart', variant('b', true)]])],
};

describe('D-Bus messages', () => {
  it('read back as they were written, header fields included', () => {
    const bytes = encode(CALL);
    expect(bytes[0]).toBe(0x6c);
    expect(messageLength(bytes)).toBe(bytes.length);
    expect(decode(bytes)).toEqual({
      ...CALL,
      errorName: undefined,
      replySerial: undefined,
      sender: undefined,
    });
    const reply = encode({ type: MessageType.reply, serial: 8, replySerial: 7, body: [] });
    expect(decode(reply)).toMatchObject({ type: MessageType.reply, replySerial: 7, body: [] });
  });

  it('wait until a whole message has arrived', () => {
    const bytes = encode(CALL);
    expect(messageLength(bytes.subarray(0, 10))).toBeUndefined();
    expect(messageLength(bytes.subarray(0, bytes.length - 1))).toBeUndefined();
    expect(messageLength(Uint8Array.from([...bytes, ...bytes]))).toBe(bytes.length);
  });

  it('refuse big-endian messages', () => {
    const bytes = encode(CALL);
    bytes[0] = 0x42;
    expect(() => decode(bytes)).toThrow('Only little-endian messages are understood.');
  });
});
