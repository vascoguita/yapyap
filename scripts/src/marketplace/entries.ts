import { Type, type Static, type TSchema } from 'typebox';
import { Value } from 'typebox/value';
import {
  marketplaceArchiveName,
  MarketplaceIndexSchema,
} from '../../../packages/sdk/src/marketplace.ts';
import { FIRST_PARTY_PREFIX } from '../../../packages/extension-sign/src/trust.ts';

const { extensions: Extensions, revoked: Revoked } = MarketplaceIndexSchema.properties;
const [Official, Unreviewed] = Extensions.items.anyOf;
const {
  version: Version,
  sha256: Sha256,
  minYapYap,
  published,
  notes,
} = Official.properties.versions.items.properties;

/** Release assets of this repository: the only place an official archive is downloaded from (ADR 0014). */
const RELEASE_ASSET =
  /^https:\/\/github\.com\/vascoguita\/yapyap\/releases\/download\/[\w.-]{1,100}\/([\w.-]{1,250})$/;

/** Pictures of the extension in use, as files in `marketplace/screenshots/<id>/` (#434). */
const Screenshots = Type.Optional(
  Type.Array(
    Type.Object(
      {
        file: Type.String({ pattern: String.raw`^[a-z0-9-]{1,40}\.(?:png|webp)$` }),
        caption: Type.String({ minLength: 1, maxLength: 200 }),
      },
      { additionalProperties: false },
    ),
    { maxItems: 5 },
  ),
);

/** Where the extension's source code lives. */
const Repository = Type.Optional(Type.String({ pattern: '^https://', maxLength: 300 }));

/**
 * YapYap's own extension, as `marketplace/extensions/<id>.json` holds it. Its
 * name, author, capabilities and hosts come from each archive's own
 * manifest, so the index can never describe it otherwise than it is.
 */
const OfficialEntrySchema = Type.Object(
  {
    id: Official.properties.id,
    summary: Official.properties.summary,
    homepage: Official.properties.homepage,
    license: Official.properties.license,
    review: Official.properties.review,
    signer: Official.properties.signer,
    screenshots: Screenshots,
    repository: Repository,
    versions: Type.Array(
      Type.Object(
        {
          version: Version,
          /** The source code's tag for this version. */
          tag: Type.Optional(Type.String({ pattern: String.raw`^[\w./-]{1,100}$` })),
          source: Type.String({ maxLength: 400 }),
          sha256: Sha256,
          minYapYap,
          published,
          notes,
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 50 },
    ),
  },
  { additionalProperties: false },
);

/**
 * A third-party extension, added once by its author's pull request and never
 * reviewed (ADR 0014): the address that always serves its latest archive,
 * and the key every archive must be signed with.
 */
const UnreviewedEntrySchema = Type.Object(
  {
    id: Unreviewed.properties.id,
    name: Unreviewed.properties.name,
    summary: Unreviewed.properties.summary,
    author: Unreviewed.properties.author,
    homepage: Unreviewed.properties.homepage,
    license: Unreviewed.properties.license,
    review: Unreviewed.properties.review,
    signer: Unreviewed.properties.signer,
    latest: Unreviewed.properties.latest,
    screenshots: Screenshots,
    repository: Repository,
  },
  { additionalProperties: false },
);

export type OfficialEntry = Static<typeof OfficialEntrySchema>;
export type UnreviewedEntry = Static<typeof UnreviewedEntrySchema>;
export type Entry = OfficialEntry | UnreviewedEntry;

/** Enough schema errors to fix a file, without burying the first under the rest. */
const REPORTED_ERRORS = 5;

/** The pulled versions, as `marketplace/revoked.json` lists them. */
export type Revocations = Static<typeof Revoked>;

/** The problems with one version's source address, if any. */
function sourceProblems(entry: OfficialEntry): string[] {
  return entry.versions.flatMap(({ version, source }) => {
    const name = RELEASE_ASSET.exec(source)?.[1];
    return name === marketplaceArchiveName(entry.id, version)
      ? []
      : [
          `${version}: the source must be this repository's release asset named ${marketplaceArchiveName(entry.id, version)}.`,
        ];
  });
}

/** An official entry's versions: each listed once, each from this repository's releases. */
function versionProblems(entry: Entry): string[] {
  if (entry.review === 'unreviewed') {
    return [];
  }
  const versions = entry.versions.map(({ version }) => version);
  return [
    ...(new Set(versions).size === versions.length ? [] : ['A version is listed twice.']),
    ...sourceProblems(entry),
  ];
}

/** What is wrong with an entry beyond its shape: its file name, who vouches for it, and its versions. */
function entryProblems(entry: Entry, file: string): string[] {
  return [
    ...(file === `${entry.id}.json` ? [] : [`The file must be named ${entry.id}.json.`]),
    ...((entry.review === 'official') === entry.id.startsWith(FIRST_PARTY_PREFIX)
      ? []
      : [`Only extensions under ${FIRST_PARTY_PREFIX} are official, and they all are.`]),
    ...versionProblems(entry),
  ];
}

const errorsOf = (schema: TSchema, json: unknown, prefix = ''): string[] =>
  [...Value.Errors(schema, json)]
    .slice(0, REPORTED_ERRORS)
    .map((error) => `${prefix}${error.instancePath || '/'}: ${error.message}`);

/** The schema an entry's own `review` asks for, so its errors name its own fields. */
const schemaOf = (json: unknown): TSchema =>
  (json as { review?: unknown } | null)?.review === 'unreviewed'
    ? UnreviewedEntrySchema
    : OfficialEntrySchema;

/** Reads one entry file's JSON, or says everything that is wrong with it. */
export function readEntry(json: unknown, file: string): Entry | string[] {
  const schema = schemaOf(json);
  if (!Value.Check(schema, json)) {
    return errorsOf(schema, json);
  }
  const entry = json as Entry;
  const problems = entryProblems(entry, file);
  return problems.length === 0 ? entry : problems;
}

/** Reads `marketplace/revoked.json`: the pulled versions, or what is wrong with the file. */
export function readRevocations(json: unknown): {
  readonly revoked: Revocations;
  readonly problems: string[];
} {
  return Value.Check(Revoked, json)
    ? { revoked: json, problems: [] }
    : { revoked: [], problems: errorsOf(Revoked, json, 'revoked.json ') };
}
