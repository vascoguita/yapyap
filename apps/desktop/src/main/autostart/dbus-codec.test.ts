import { describe, expect, it } from 'vitest';
import { firstType, Reader, types, variant, Writer, type DBusValue } from './dbus-codec.ts';

const roundTrip = (signature: string, value: DBusValue): DBusValue => {
  const writer = new Writer();
  writer.write(signature, value);
  return new Reader(writer.done()).read(signature);
};

describe('the D-Bus codec', () => {
  it('splits signatures into their complete types', () => {
    expect(types('sa{sv}a(yv)ub')).toEqual(['s', 'a{sv}', 'a(yv)', 'u', 'b']);
    expect(firstType('aas')).toBe(3);
    expect(() => firstType('(ys')).toThrow('Unbalanced signature: (ys');
    expect(() => firstType('x')).toThrow('Unsupported signature: x');
    expect(() => firstType('')).toThrow('Unsupported signature: ');
  });

  it('reads back what it writes, aligned', () => {
    expect(roundTrip('y', 7)).toBe(7);
    expect(roundTrip('b', true)).toBe(true);
    expect(roundTrip('b', false)).toBe(false);
    expect(roundTrip('u', 4_000_000_000)).toBe(4_000_000_000);
    expect(roundTrip('s', 'héllo')).toBe('héllo');
    expect(roundTrip('o', '/org/example')).toBe('/org/example');
    expect(roundTrip('g', 'a{sv}')).toBe('a{sv}');
    expect(roundTrip('as', ['yapyap', '--x'])).toEqual(['yapyap', '--x']);
    expect(roundTrip('a(yv)', [[1, variant('o', '/p')]])).toEqual([[1, variant('o', '/p')]]);
    const options = new Map([
      ['autostart', variant('b', true)],
      ['commandline', variant('as', ['yapyap'])],
    ]);
    expect(roundTrip('a{sv}', options)).toEqual(options);
    expect(roundTrip('a{sv}', new Map())).toEqual(new Map());
    // Fields a struct does not get are written as zero.
    expect(roundTrip('(yu)', [5])).toEqual([5, 0]);
  });

  it('pads a value to its alignment, and a struct to eight bytes', () => {
    const writer = new Writer();
    writer.write('y', 1);
    writer.write('u', 2);
    writer.write('(y)', [3]);
    expect([...writer.done()]).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 3]);
    const reader = new Reader(writer.done());
    reader.read('y');
    reader.pad(4);
    expect(reader.position).toBe(4);
  });

  it('refuses to write or read a type it does not know', () => {
    expect(() => {
      new Writer().write('x', 1);
    }).toThrow('Unsupported signature: x');
    expect(() => new Reader(new Uint8Array(8)).read('ax')).toThrow('Unsupported signature: x');
  });

  it('refuses a message that ends too early', () => {
    expect(() => new Reader(new Uint8Array()).read('y')).toThrow('The message ended early.');
    const writer = new Writer();
    writer.write('s', 'cut');
    expect(() => new Reader(writer.done().subarray(0, 6)).read('s')).toThrow(
      'The message ended early.',
    );
  });
});
