import { describe, expect, it } from 'vitest';
import { readEntry, type OfficialEntry } from './entries.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plainNotes, readOptional, withRelease, type Release } from './release.ts';

const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');

const DEFAULTS = {
  summary: 'Suggests replies.',
  homepage: 'https://yapyap.guita.org/',
  license: 'MIT',
  signer: SIGNER,
  repository: 'https://github.com/vascoguita/yapyap',
};

const RELEASE: Release = {
  id: 'org.guita.yapyap.call-recorder',
  version: '0.2.0',
  tag: 'call-recorder-v0.2.0',
  file: 'org.guita.yapyap.call-recorder-0.2.0.yapyap-extension',
  archive: new TextEncoder().encode('archive'),
  minYapYap: '0.3.0',
  published: '2026-10-31T08:00:00.000Z',
  notes:
    '## [0.2.0](https://x/compare) (2026-10-31)\n\n### Features\n\n* **call-recorder:** pick the model ([#472](https://x/472)) ([6dd2b3e](https://x/6dd2b3e))\n',
};

const ASSET =
  'https://github.com/vascoguita/yapyap/releases/download/call-recorder-v0.2.0/org.guita.yapyap.call-recorder-0.2.0.yapyap-extension';

describe('withRelease', () => {
  it('starts an official entry the first time, with the release as its only version', () => {
    const entry = withRelease(undefined, RELEASE, DEFAULTS);
    expect(entry).toEqual({
      id: 'org.guita.yapyap.call-recorder',
      ...DEFAULTS,
      review: 'official',
      versions: [
        {
          version: '0.2.0',
          tag: 'call-recorder-v0.2.0',
          source: ASSET,
          // SHA-256 of "archive".
          sha256: 'sha256-DrPja/sk3Nm7HRvs4VMSFrWVOaj94X7oAiSvBlPJKqM=',
          minYapYap: '0.3.0',
          published: '2026-10-31T08:00:00.000Z',
          notes: '* call-recorder: pick the model',
        },
      ],
    });
    expect(readEntry(entry, 'org.guita.yapyap.call-recorder.json')).toEqual(entry);
  });

  it('lists a new release last, replaces one released again, and keeps fifty at most', () => {
    const first = withRelease(undefined, RELEASE, DEFAULTS);
    const next = withRelease(first, { ...RELEASE, version: '0.3.0', notes: '' }, DEFAULTS);
    expect(next.versions.map(({ version }) => version)).toEqual(['0.2.0', '0.3.0']);
    expect(next.versions[1]).not.toHaveProperty('notes');
    const again = withRelease(next, { ...RELEASE, archive: new Uint8Array([1]) }, DEFAULTS);
    expect(again.versions.map(({ version }) => version)).toEqual(['0.3.0', '0.2.0']);
    const many: OfficialEntry = {
      ...first,
      versions: Array.from({ length: 50 }, (_, index) => ({
        ...first.versions[0],
        version: `0.0.${String(index)}`,
      })) as OfficialEntry['versions'],
    };
    const crowded = withRelease(many, RELEASE, DEFAULTS);
    expect(crowded.versions).toHaveLength(50);
    expect(crowded.versions[0]?.version).toBe('0.0.1');
    expect(crowded.versions.at(-1)?.version).toBe('0.2.0');
  });
});

describe('plainNotes', () => {
  it('keeps what changed as plain text, within the marketplace’s limit', () => {
    expect(plainNotes('### Bug Fixes\n\n* **bar:** [keep](https://x) it\n\n\n\n* two')).toBe(
      '* bar: keep it\n\n* two',
    );
    expect(plainNotes('## [0.2.0](https://x)\n\n')).toBeUndefined();
    expect(plainNotes(`* ${'x'.repeat(3000)}`)).toHaveLength(2000);
  });
});

describe('readOptional', () => {
  it('reads a JSON file, finds none before the first release, and lets other failures through', () => {
    const folder = mkdtempSync(join(tmpdir(), 'yapyap-release-'));
    try {
      const file = join(folder, 'entry.json');
      writeFileSync(file, '{"id":"x"}');
      expect(readOptional(file)).toEqual({ id: 'x' });
      expect(readOptional(join(folder, 'missing.json'))).toBeUndefined();
      writeFileSync(file, 'not json');
      expect(() => readOptional(file)).toThrow(SyntaxError);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
