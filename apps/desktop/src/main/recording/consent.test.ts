import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_VERSION, recordingConsent } from './consent.ts';

let root: string;
let file: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'yapyap-consent-'));
  file = join(root, 'recording-consent.json');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('recordingConsent', () => {
  it('asks once, and keeps the answer once the user confirms', async () => {
    const ask = vi.fn(() => Promise.resolve(true));
    const consent = recordingConsent(file, ask);
    expect(await consent()).toBe(true);
    expect(await consent()).toBe(true);
    expect(ask).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: CONSENT_VERSION });
  });

  it('asks again after a refusal, and when the warning changed', async () => {
    const ask = vi.fn(() => Promise.resolve(false));
    const consent = recordingConsent(file, ask);
    expect(await consent()).toBe(false);
    expect(await consent()).toBe(false);
    expect(ask).toHaveBeenCalledTimes(2);
    for (const text of [
      JSON.stringify({ version: CONSENT_VERSION - 1 }),
      '{',
      JSON.stringify({ version: 'one' }),
    ]) {
      writeFileSync(file, text);
      expect(await consent()).toBe(false);
    }
    expect(ask).toHaveBeenCalledTimes(5);
  });
});
