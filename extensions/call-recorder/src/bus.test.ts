import { describe, expect, it } from 'vitest';
import { request, status } from './bus.ts';

const ID = 'a'.repeat(32);

describe('request', () => {
  it('takes the panel’s requests, and a recording only by a YapYap ID', () => {
    expect(request({ type: 'status?' })).toEqual({ type: 'status?' });
    expect(request({ type: 'record', extra: 1 })).toEqual({ type: 'record' });
    expect(request({ type: 'stop' })).toEqual({ type: 'stop' });
    expect(request({ type: 'reveal', id: ID })).toEqual({ type: 'reveal', id: ID });
    for (const odd of [
      null,
      'record',
      { type: 'reveal' },
      { type: 'reveal', id: '../x' },
      { type: 'reveal', id: `${ID}0` },
      { type: 'delete', id: ID },
    ]) {
      expect(request(odd)).toBeUndefined();
    }
  });
});

describe('status', () => {
  const good = {
    type: 'status',
    supported: true,
    call: false,
    recordingSince: null,
    recordings: [{ id: ID, started: '2026-10-29T10:00:00.000Z', durationMs: 65_000 }],
  };

  it('takes the hidden page’s status, and nothing malformed', () => {
    expect(status(good)).toBe(good);
    expect(status({ ...good, recordingSince: '2026-10-29T10:00:00.000Z' })).toBeDefined();
    for (const odd of [
      null,
      { ...good, type: 'other' },
      { ...good, supported: 'yes' },
      { ...good, call: 1 },
      { ...good, recordingSince: 5 },
      { ...good, recordings: 'none' },
      { ...good, recordings: [{ id: ID, started: 1, durationMs: 1 }] },
      { ...good, recordings: [{ id: 1, started: 'x', durationMs: 1 }] },
      { ...good, recordings: [{ id: ID, started: 'x', durationMs: '1' }] },
    ]) {
      expect(status(odd)).toBeUndefined();
    }
  });
});
