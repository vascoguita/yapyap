/** Bytes per sample: WAV recordings are 16-bit PCM. */
const SAMPLE_BYTES = 2;

/** The length of a WAV header, which the main process completes at the end (#442). */
export const WAV_HEADER_BYTES = 44;

/** The largest 16-bit sample, which a full-scale float maps to. */
const FULL_SCALE = 0x7fff;

const ascii = (text: string): number[] => Array.from(new TextEncoder().encode(text));

const uint32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  value >>> 24,
];

const uint16 = (value: number): number[] => [value & 0xff, value >>> 8];

/**
 * A WAV header for 16-bit PCM, with the file and data sizes left at zero:
 * the recording streams out as it is made, so its length is known only once
 * it stops, when the main process writes them in.
 */
export function wavHeader(sampleRate: number, channels: number): Uint8Array<ArrayBuffer> {
  const blockAlign = channels * SAMPLE_BYTES;
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...uint32(0),
    ...ascii('WAVEfmt '),
    ...uint32(16),
    ...uint16(1),
    ...uint16(channels),
    ...uint32(sampleRate),
    ...uint32(sampleRate * blockAlign),
    ...uint16(blockAlign),
    ...uint16(SAMPLE_BYTES * 8),
    ...ascii('data'),
    ...uint32(0),
  ]);
}

/** Interleaves the channels' float samples into little-endian 16-bit PCM, clipped to full scale. */
export function pcm16(channels: readonly Float32Array[]): Uint8Array<ArrayBuffer> {
  const frames = channels[0]?.length ?? 0;
  const out = new DataView(new ArrayBuffer(frames * channels.length * SAMPLE_BYTES));
  for (const [channel, samples] of channels.entries()) {
    for (const [frame, value] of samples.entries()) {
      const sample = Math.max(-1, Math.min(1, value));
      const offset = (frame * channels.length + channel) * SAMPLE_BYTES;
      out.setInt16(offset, Math.round(sample * FULL_SCALE), true);
    }
  }
  return new Uint8Array(out.buffer);
}
