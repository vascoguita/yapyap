import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  it('is unconfirmed until the user confirms, and keeps the confirmation', async () => {
    const consent = recordingConsent(file);
    expect(await consent.confirmed()).toBe(false);
    consent.confirm();
    expect(await consent.confirmed()).toBe(true);
    expect(await recordingConsent(file).confirmed()).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: CONSENT_VERSION });
  });

  it('is unconfirmed again when the warning changed, or the file is unreadable', async () => {
    const consent = recordingConsent(file);
    for (const text of [
      JSON.stringify({ version: CONSENT_VERSION - 1 }),
      '{',
      JSON.stringify({ version: 'one' }),
    ]) {
      writeFileSync(file, text);
      expect(await consent.confirmed()).toBe(false);
    }
  });
});
