import { describe, expect, it } from 'vitest';
import { QWEN } from '../testing/local.ts';
import { builtInRecord, labelOf } from './record.ts';
import type { Phase } from './local-model.ts';
import { wordsFor } from './words.ts';

const say = (phase: Phase, offered = false, smaller = true) =>
  wordsFor({ model: QWEN, phase, smaller }, offered);

describe('wordsFor', () => {
  it('offers the private model only when asked to, by its size and never its name', () => {
    expect(say({ kind: 'none' })).toEqual({ status: '', label: '', action: '' });
    expect(say({ kind: 'none' }, true)).toEqual({
      status:
        'Use a private model on this computer (about 1.1 GB, downloaded once)? Your messages never leave it.',
      label: 'Use a private model',
      action: 'download',
    });
  });

  it('says how far the download is, and why it stopped, with a way to resume', () => {
    expect(say({ kind: 'downloading', done: 450_000_000 }).status).toBe(
      'Downloading the private model: 40% (450 of 1,117 MB)',
    );
    expect(say({ kind: 'paused', done: 450_000_000, problem: '' })).toEqual({
      status: 'The private model’s download is paused: 40% (450 of 1,117 MB).',
      label: 'Resume',
      action: 'download',
    });
    expect(say({ kind: 'paused', done: 450_000_000, problem: 'download-failed' }).status).toBe(
      'The download stopped. Check your connection, then resume: 40% (450 of 1,117 MB).',
    );
    expect(say({ kind: 'paused', done: 117_320_736, problem: 'disk-full' })).toEqual({
      status: 'Not enough disk space for the private model: free up about 1.0 GB, then resume.',
      label: 'Resume',
      action: 'download',
    });
    expect(say({ kind: 'damaged' })).toEqual({
      status: 'The downloaded model was damaged, so it was deleted. Download it again?',
      label: 'Download again',
      action: 'download',
    });
  });

  it('says it warms up, is ready, or does not fit, offering the smaller one if there is one', () => {
    expect(say({ kind: 'warming' }).status).toBe('Warming up the model…');
    expect(say({ kind: 'ready' }).status).toBe(
      'The private model is ready. Your messages stay on this computer.',
    );
    expect(say({ kind: 'out-of-memory' })).toEqual({
      status: 'This computer doesn’t have enough memory for this model. Try the smaller one?',
      label: 'Try the smaller one',
      action: 'smaller',
    });
    expect(say({ kind: 'out-of-memory' }, false, false)).toEqual({
      status:
        'This computer doesn’t have enough memory for the private model. Close other apps, then try again.',
      label: '',
      action: '',
    });
  });
});

describe('builtInRecord', () => {
  it('takes only the record the assistant keeps', () => {
    const record = { model: 'qwen', name: 'Qwen', ready: true };
    expect(builtInRecord(record)).toEqual(record);
    expect(builtInRecord({ ...record, ready: 'yes' })).toBeUndefined();
    expect(builtInRecord(undefined)).toBeUndefined();
    expect(labelOf('Qwen2.5 1.5B')).toBe('Private model (Qwen2.5 1.5B)');
  });
});
