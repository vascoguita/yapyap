import { describe, expect, it } from 'vitest';
import { readEntry, readRevocations, type OfficialEntry, type UnreviewedEntry } from './entries.ts';

const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');
const RELEASES = 'https://github.com/vascoguita/yapyap/releases/download';

const ENTRY: OfficialEntry = {
  id: 'org.guita.yapyap.hello',
  summary: 'Says hello.',
  homepage: 'https://yapyap.guita.org/',
  license: 'MIT',
  review: 'official',
  signer: SIGNER,
  repository: 'https://github.com/vascoguita/yapyap',
  versions: [
    {
      version: '1.0.0',
      tag: 'hello-v1.0.0',
      source: `${RELEASES}/hello-v1.0.0/org.guita.yapyap.hello-1.0.0.yapyap-extension`,
      sha256: `sha256-${'A'.repeat(43)}=`,
      minYapYap: '0.1.2',
      published: '2026-10-27T08:00:00.000Z',
    },
  ],
};
const [VERSION] = ENTRY.versions;
const FILE = 'org.guita.yapyap.hello.json';

const UNREVIEWED: UnreviewedEntry = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example', url: 'https://example.org' },
  homepage: 'https://example.org/hello',
  license: 'MIT',
  review: 'unreviewed',
  signer: SIGNER,
  latest: 'https://downloads.example.org/hello/latest.yapyap-extension',
  repository: 'https://git.example.org/hello',
};

describe('readEntry', () => {
  it('reads an official entry under YapYap’s own ID, and an unreviewed third-party one', () => {
    expect(readEntry(ENTRY, FILE)).toEqual(ENTRY);
    expect(readEntry(UNREVIEWED, 'org.example.hello.json')).toEqual(UNREVIEWED);
  });

  it('says where the shape is wrong, at most five times', () => {
    const problems = readEntry({ ...ENTRY, review: 'reviewed' }, FILE);
    expect(problems).toContainEqual(expect.stringMatching(/^\/review: /));
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
      'must be named org.guita.yapyap.hello.json',
    ],
    [
      'a third-party extension marked official',
      {
        ...ENTRY,
        id: 'org.example.hello',
        versions: [
          { ...VERSION, source: `${RELEASES}/v1/org.example.hello-1.0.0.yapyap-extension` },
        ],
      },
      'org.example.hello.json',
      'are official',
    ],
    [
      'YapYap’s own extension listed as unreviewed',
      { ...UNREVIEWED, id: 'org.guita.yapyap.hello' },
      FILE,
      'are official',
    ],
    ['a version listed twice', { ...ENTRY, versions: [VERSION, VERSION] }, FILE, 'listed twice'],
    [
      'a source on another server',
      {
        ...ENTRY,
        versions: [
          {
            ...VERSION,
            source: 'https://example.org/org.guita.yapyap.hello-1.0.0.yapyap-extension',
          },
        ],
      },
      FILE,
      'release asset named org.guita.yapyap.hello-1.0.0.yapyap-extension',
    ],
    [
      'a source in another repository',
      {
        ...ENTRY,
        versions: [
          {
            ...VERSION,
            source:
              'https://github.com/someone/yapyap/releases/download/v1/org.guita.yapyap.hello-1.0.0.yapyap-extension',
          },
        ],
      },
      FILE,
      'release asset',
    ],
    [
      'a source named for another version',
      {
        ...ENTRY,
        versions: [
          { ...VERSION, source: `${RELEASES}/v1/org.guita.yapyap.hello-2.0.0.yapyap-extension` },
        ],
      },
      FILE,
      '1.0.0: the source',
    ],
    [
      'a source with something after the name',
      {
        ...ENTRY,
        versions: [
          {
            ...VERSION,
            source: `${RELEASES}/v1/org.guita.yapyap.hello-1.0.0.yapyap-extension?x=1`,
          },
        ],
      },
      FILE,
      'release asset',
    ],
  ])('refuses %s', (_case, entry, file, problem) => {
    expect(readEntry(entry, file)).toEqual([expect.stringContaining(problem) as string]);
  });
});

describe('readEntry for an unreviewed extension', () => {
  // Entries are JSON, where a missing field is simply absent.
  const without = (value: object): unknown => JSON.parse(JSON.stringify(value));
  const file = 'org.example.hello.json';

  it('needs no repository, and lists no versions or hashes', () => {
    const plain = without({ ...UNREVIEWED, repository: undefined });
    expect(readEntry(plain, file)).toEqual(plain);
    expect(readEntry({ ...UNREVIEWED, versions: ENTRY.versions }, file)).toContainEqual(
      expect.stringContaining('/versions') as string,
    );
  });

  it.each([
    ['over HTTP', 'http://downloads.example.org/hello.yapyap-extension'],
    ['with credentials', 'https://user:token@downloads.example.org/hello'],
    ['with no path', 'https://downloads.example.org'],
    ['with a fragment', 'https://downloads.example.org/hello#latest'],
  ])('refuses a latest address %s', (_case, latest) => {
    expect(readEntry({ ...UNREVIEWED, latest }, file)).toEqual([
      expect.stringMatching(/^\/latest: /) as string,
    ]);
  });

  it('needs the name and author an official entry takes from its archive', () => {
    expect(readEntry(without({ ...UNREVIEWED, name: undefined }), file)).toEqual([
      expect.stringContaining('name') as string,
    ]);
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
