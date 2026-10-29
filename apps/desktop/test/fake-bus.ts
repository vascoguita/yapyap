import type { DBusValue } from '../src/main/autostart/dbus-codec.ts';
import type { BusSocket } from '../src/main/autostart/dbus-client.ts';
import {
  decode,
  encode,
  messageLength,
  MessageType,
  type Message,
} from '../src/main/autostart/dbus-message.ts';

/** What the fake bus answers a method call with: a reply body, an error name, or nothing. */
export type Answer =
  | { readonly body: readonly DBusValue[]; readonly signature: string }
  | { readonly error: string }
  | undefined;

/** A message the fake bus sends after the reply: a signal, unless it says otherwise. */
export type Emitted = Omit<Message, 'type' | 'serial'> & { readonly type?: number };

/**
 * An in-memory session bus for tests (#234): it authenticates anyone who
 * offers EXTERNAL, answers Hello, records every call, and answers the rest
 * as `answer` says, sending any signals it returns after the reply. Bytes go
 * out in two pieces, so the client must put messages back together.
 */
export function fakeBus(
  answer: (call: Message) => { readonly reply?: Answer; readonly signals?: readonly Emitted[] },
  auth = 'OK 0123456789abcdef\r\n',
): { socket: BusSocket; calls: Message[]; ended: () => boolean; close: () => void } {
  const data: ((bytes: Uint8Array) => void)[] = [];
  const closed: (() => void)[] = [];
  const calls: Message[] = [];
  let serial = 1000;
  let ended = false;
  let pending = new Uint8Array();
  const send = (bytes: Uint8Array): void => {
    const half = Math.ceil(bytes.length / 2);
    queueMicrotask(() => {
      for (const piece of [bytes.subarray(0, half), bytes.subarray(half)]) {
        data.forEach((listener) => {
          listener(piece);
        });
      }
    });
  };
  const reply = (call: Message, answered: Answer): void => {
    serial += 1;
    if (answered === undefined) {
      return;
    }
    const base = { serial, replySerial: call.serial, destination: ':1.42' };
    send(
      encode(
        'error' in answered
          ? { ...base, type: MessageType.error, errorName: answered.error, body: [] }
          : {
              ...base,
              type: MessageType.reply,
              signature: answered.signature,
              body: answered.body,
            },
      ),
    );
  };
  const handle = (call: Message): void => {
    calls.push(call);
    if (call.member === 'Hello') {
      reply(call, { body: [':1.42'], signature: 's' });
      return;
    }
    const { reply: answered, signals = [] } = answer(call);
    reply(call, answered);
    for (const signal of signals) {
      serial += 1;
      send(encode({ type: MessageType.signal, ...signal, serial }));
    }
  };
  const socket: BusSocket = {
    write: (written) => {
      if (typeof written === 'string') {
        if (written.startsWith('\0AUTH EXTERNAL ')) {
          send(new TextEncoder().encode(auth));
        }
        return;
      }
      pending = Uint8Array.from([...pending, ...written]);
      for (
        let length = messageLength(pending);
        length !== undefined;
        length = messageLength(pending)
      ) {
        handle(decode(pending.subarray(0, length)));
        pending = pending.slice(length);
      }
    },
    on: (event: 'data' | 'close', listener: ((bytes: Uint8Array) => void) | (() => void)) => {
      if (event === 'data') {
        data.push(listener);
      } else {
        closed.push(listener as () => void);
      }
    },
    end: () => {
      ended = true;
    },
  };
  return {
    socket,
    calls,
    ended: () => ended,
    close: () => {
      closed.forEach((listener) => {
        listener();
      });
    },
  };
}
