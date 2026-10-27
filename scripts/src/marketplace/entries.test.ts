import { describe, expect, it } from 'vitest';
import { readEntry, readRevocations, type Entry } from './entries.ts';

const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');
const RELEASES = 'https://github.com/vascoguita/yapyap/releases/download';

const ENTRY: Entry = {
  id: 'org.example.hello',
  summary: 'Says hello.',
  homepage: 'https://example.org/hello',
  license: 'MIT',
  review: 'reviewed',
  signer: SIGNER,
  repository: 'https://github.com/example/hello',
  versions: [
    {
      version: '1.0.0',
      tag: 'v1.0.0',
      source: `${RELEASES}/plugins/org.example.hello-1.0.0.yapyap-plugin`,
      sha256: `sha256-${'A'.repeat(43)}=`,
      minYapYap: '0.1.2',
      published: '2026-10-27T08:00:00.000Z',
    },
  ],
};
const [VERSION] = ENTRY.versions;

describe('readEntry', () => {
  it('reads a reviewed third-party entry, and an official one under YapYap’s own ID', () => {
    expect(readEntry(ENTRY, 'org.example.hello.json')).toEqual(ENTRY);
    const official = {
      ...ENTRY,
      id: 'org.guita.yapyap.hello',
      review: 'official',
      versions: [
        { ...VERSION, source: `${RELEASES}/v0.1.2/org.guita.yapyap.hello-1.0.0.yapyap-plugin` },
      ],
    };
    expect(readEntry(official, 'org.guita.yapyap.hello.json')).toEqual(official);
  });

  it('says where the shape is wrong, at most five times', () => {
    const problems = readEntry({ ...ENTRY, review: 'trusted' }, 'org.example.hello.json');
    expect(problems).toContain('/review: must match a schema in anyOf');
    expect(readEntry({}, 'x.json')).toHaveLength(1);
    expect(
      readEntry(
        { id: 1, summary: 2, homepage: 3, license: 4, review: 5, signer: 6, versions: 7 },
        'x.json',
      ),
    ).toHaveLength(5);
  });

  it.each([
    [
      'a file named after another ID',
      ENTRY,
      'org.example.other.json',
      'must be named org.example.hello.json',
    ],
    [
      'a third-party plugin marked official',
      { ...ENTRY, review: 'official' },
      'org.example.hello.json',
      'are official',
    ],
    [
      'YapYap’s own plugin marked reviewed',
      {
        ...ENTRY,
        id: 'org.guita.yapyap.hello',
        versions: [
          { ...VERSION, source: `${RELEASES}/v1/org.guita.yapyap.hello-1.0.0.yapyap-plugin` },
        ],
      },
      'org.guita.yapyap.hello.json',
      'are official',
    ],
    [
      'a version listed twice',
      { ...ENTRY, versions: [VERSION, VERSION] },
      'org.example.hello.json',
      'listed twice',
    ],
    [
      'a source on another server',
      {
        ...ENTRY,
        versions: [
          { ...VERSION, source: 'https://example.org/org.example.hello-1.0.0.yapyap-plugin' },
        ],
      },
      'org.example.hello.json',
      'release asset named org.example.hello-1.0.0.yapyap-plugin',
    ],
    [
      'a source in another repository',
      {
        ...ENTRY,
        versions: [
          {
            ...VERSION,
            source:
              'https://github.com/someone/yapyap/releases/download/v1/org.example.hello-1.0.0.yapyap-plugin',
          },
        ],
      },
      'org.example.hello.json',
      'release asset',
    ],
    [
      'a source named for another version',
      {
        ...ENTRY,
        versions: [
          { ...VERSION, source: `${RELEASES}/plugins/org.example.hello-2.0.0.yapyap-plugin` },
        ],
      },
      'org.example.hello.json',
      '1.0.0: the source',
    ],
    [
      'a source with something after the name',
      {
        ...ENTRY,
        versions: [
          { ...VERSION, source: `${RELEASES}/plugins/org.example.hello-1.0.0.yapyap-plugin?x=1` },
        ],
      },
      'org.example.hello.json',
      'release asset',
    ],
  ])('refuses %s', (_case, entry, file, problem) => {
    expect(readEntry(entry, file)).toEqual([expect.stringContaining(problem) as string]);
  });
});

describe('readEntry for a reviewed plugin', () => {
  it('needs its source repository, and the tag of each version', () => {
    // Entries are JSON, where a missing field is simply absent.
    const without = (value: object): unknown => JSON.parse(JSON.stringify(value));
    expect(
      readEntry(without({ ...ENTRY, repository: undefined }), 'org.example.hello.json'),
    ).toEqual(['A reviewed plugin names its source repository.']);
    expect(
      readEntry(
        without({ ...ENTRY, versions: [{ ...VERSION, tag: undefined }] }),
        'org.example.hello.json',
      ),
    ).toEqual(['1.0.0: a reviewed plugin names the tag of its source.']);
    expect(
      readEntry({ ...ENTRY, versions: [{ ...VERSION, tag: 'v1 0' }] }, 'org.example.hello.json'),
    ).toHaveLength(1);
  });
});

describe('readRevocations', () => {
  it('reads the pulled versions, or says what is wrong', () => {
    const revoked = [
      { id: 'org.example.bad', versions: '*', signer: SIGNER, reason: 'Sent chats away.' },
    ];
    expect(readRevocations(revoked)).toEqual({ revoked, problems: [] });
    expect(readRevocations([])).toEqual({ revoked: [], problems: [] });
    const { revoked: none, problems } = readRevocations([{ ...revoked[0], reason: '' }]);
    expect(none).toEqual([]);
    expect(problems).toEqual([expect.stringMatching(/^revoked\.json \/0\/reason: /) as string]);
    expect(readRevocations({}).problems).toEqual([
      expect.stringMatching(/^revoked\.json \/: /) as string,
    ]);
  });
});
