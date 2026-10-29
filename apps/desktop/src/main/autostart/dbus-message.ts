import { Reader, types, variant, Writer, type DBusValue, type Variant } from './dbus-codec.ts';

/** The message kinds of the D-Bus protocol, by their number on the wire. */
export const MessageType = { call: 1, reply: 2, error: 3, signal: 4 } as const;

/** A D-Bus message, as far as the Background portal needs one. */
export interface Message {
  readonly type: number;
  readonly serial: number;
  readonly path?: string | undefined;
  readonly interface?: string | undefined;
  readonly member?: string | undefined;
  readonly errorName?: string | undefined;
  readonly replySerial?: number | undefined;
  readonly destination?: string | undefined;
  readonly sender?: string | undefined;
  readonly signature?: string | undefined;
  readonly body: readonly DBusValue[];
}

/** Header fields in the order of their codes, which start at 1, and the type each one's value has. */
const FIELDS = (
  [
    ['path', 'o'],
    ['interface', 's'],
    ['member', 's'],
    ['errorName', 's'],
    ['replySerial', 'u'],
    ['destination', 's'],
    ['sender', 's'],
    ['signature', 'g'],
  ] as const
).map(([name, type], index) => [name, index + 1, type] as const);

/** The first byte of a little-endian message: an ASCII `l`. */
const LITTLE_ENDIAN = 0x6c;

/** The fixed part of every header: endianness, type, flags, version, lengths, serial. */
const FIXED = 12;

/** Encodes a message, little-endian, protocol version 1. */
export function encode(message: Message): Uint8Array {
  const body = new Writer();
  body.write(`(${message.signature ?? ''})`, message.body);
  const fields: [number, Variant][] = FIELDS.flatMap(([name, code, type]) => {
    const value = message[name];
    return value === undefined ? [] : [[code, variant(type, value)] as [number, Variant]];
  });
  const head = new Writer();
  head.raw([LITTLE_ENDIAN, message.type, 0, 1]);
  head.uint32(body.length);
  head.uint32(message.serial);
  head.write('a(yv)', fields);
  head.pad(8);
  return Uint8Array.from([...head.done(), ...body.done()]);
}

/** The length of the first message in `bytes`, or undefined until it has all arrived. */
export function messageLength(bytes: Uint8Array): number | undefined {
  if (bytes.length < FIXED + 4) {
    return undefined;
  }
  const reader = new Reader(bytes, 4);
  const bodyLength = reader.uint32();
  reader.uint32();
  const fieldsLength = reader.uint32();
  const headerEnd = FIXED + 4 + fieldsLength;
  const total = headerEnd + ((8 - (headerEnd % 8)) % 8) + bodyLength;
  return bytes.length >= total ? total : undefined;
}

/** Decodes one whole, little-endian message. */
export function decode(bytes: Uint8Array): Message {
  if (bytes[0] !== LITTLE_ENDIAN) {
    throw new Error('Only little-endian messages are understood.');
  }
  const reader = new Reader(bytes, 8);
  const serial = reader.uint32();
  const fields = new Map(
    (reader.read('a(yv)') as [number, Variant][]).map(([code, held]) => [code, held.value]),
  );
  reader.pad(8);
  const named = Object.fromEntries(FIELDS.map(([name, code]) => [name, fields.get(code)]));
  const signature = (named['signature'] as string | undefined) ?? '';
  return {
    ...named,
    type: new Reader(bytes, 1).read('y'),
    serial,
    body: types(signature).map((type) => reader.read(type)),
  } as Message;
}
