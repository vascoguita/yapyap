import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import {
  marketplaceArchiveName,
  MarketplaceIndexSchema,
} from '../../../packages/sdk/src/marketplace.ts';
import { FIRST_PARTY_PREFIX } from '../../../packages/plugin-sign/src/trust.ts';

const { plugins: Plugins, revoked: Revoked } = MarketplaceIndexSchema.properties;
const Plugin = Plugins.items;
const {
  version: Version,
  sha256: Sha256,
  minYapYap,
  published,
} = Plugin.properties.versions.items.properties;

/** Release assets of this repository: the only place a listed archive is downloaded from (ADR 0014). */
const RELEASE_ASSET =
  /^https:\/\/github\.com\/vascoguita\/yapyap\/releases\/download\/[\w.-]{1,100}\/([\w.-]{1,250})$/;

/**
 * A listed plugin, as `marketplace/plugins/<id>.json` holds it. Its name,
 * author, capabilities and hosts come from each archive's own manifest, so
 * the index can never describe a plugin otherwise than it is.
 */
const EntrySchema = Type.Object(
  {
    id: Plugin.properties.id,
    summary: Plugin.properties.summary,
    homepage: Plugin.properties.homepage,
    license: Plugin.properties.license,
    review: Plugin.properties.review,
    signer: Plugin.properties.signer,
    versions: Type.Array(
      Type.Object(
        {
          version: Version,
          source: Type.String({ maxLength: 400 }),
          sha256: Sha256,
          minYapYap,
          published,
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 50 },
    ),
  },
  { additionalProperties: false },
);

export type Entry = Static<typeof EntrySchema>;

/** The pulled versions, as `marketplace/revoked.json` lists them. */
export type Revocations = Static<typeof Revoked>;

/** The problems with one version's source address, if any. */
function sourceProblems(entry: Entry): string[] {
  return entry.versions.flatMap(({ version, source }) => {
    const name = RELEASE_ASSET.exec(source)?.[1];
    return name === marketplaceArchiveName(entry.id, version)
      ? []
      : [
          `${version}: the source must be this repository's release asset named ${marketplaceArchiveName(entry.id, version)}.`,
        ];
  });
}

/** What is wrong with an entry beyond its shape: its file name, review, sources and versions. */
function entryProblems(entry: Entry, file: string): string[] {
  const versions = entry.versions.map(({ version }) => version);
  return [
    ...(file === `${entry.id}.json` ? [] : [`The file must be named ${entry.id}.json.`]),
    ...((entry.review === 'official') === entry.id.startsWith(FIRST_PARTY_PREFIX)
      ? []
      : [`Only plugins under ${FIRST_PARTY_PREFIX} are official, and they all are.`]),
    ...(new Set(versions).size === versions.length ? [] : ['A version is listed twice.']),
    ...sourceProblems(entry),
  ];
}

/** Reads one entry file's JSON, or says everything that is wrong with it. */
export function readEntry(json: unknown, file: string): Entry | string[] {
  if (!Value.Check(EntrySchema, json)) {
    return [...Value.Errors(EntrySchema, json)]
      .slice(0, 5)
      .map((error) => `${error.instancePath || '/'}: ${error.message}`);
  }
  const problems = entryProblems(json, file);
  return problems.length === 0 ? json : problems;
}

/** Reads `marketplace/revoked.json`: the pulled versions, or what is wrong with the file. */
export function readRevocations(json: unknown): {
  readonly revoked: Revocations;
  readonly problems: string[];
} {
  return Value.Check(Revoked, json)
    ? { revoked: json, problems: [] }
    : {
        revoked: [],
        problems: [...Value.Errors(Revoked, json)]
          .slice(0, 5)
          .map((error) => `revoked.json ${error.instancePath || '/'}: ${error.message}`),
      };
}
