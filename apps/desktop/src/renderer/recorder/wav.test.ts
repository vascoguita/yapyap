import { describe, expect, it } from 'vitest';
import { pcm16, WAV_HEADER_BYTES, wavHeader } from './wav.ts';

describe('wavHeader', () => {
  it('describes 16-bit PCM at the rate and channels given, sizes left for later', () => {
    const header = wavHeader(48_000, 2);
    const view = new DataView(header.buffer);
    const text = (at: number, length: number) =>
      new TextDecoder().decode(header.subarray(at, at + length));
    expect(header).toHaveLength(WAV_HEADER_BYTES);
    expect([text(0, 4), text(8, 8), text(36, 4)]).toEqual(['RIFF', 'WAVEfmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(0);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(192_000);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(0);
  });
});

describe('pcm16', () => {
  it('interleaves the channels and clips to full scale', () => {
    const left = Float32Array.from([0, 1, -2]);
    const right = Float32Array.from([0.5, -1, 2]);
    const view = new DataView(pcm16([left, right]).buffer);
    const samples = Array.from({ length: 6 }, (_, index) => view.getInt16(index * 2, true));
    expect(samples).toEqual([0, 16384, 32767, -32767, -32767, 32767]);
    expect(pcm16([])).toHaveLength(0);
  });
});
