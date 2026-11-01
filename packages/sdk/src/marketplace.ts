import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { ManifestSchema } from './manifest.ts';

/** Where YapYap downloads the extension marketplace's index (ADR 0014). */
export const MARKETPLACE_INDEX_URL = 'https://packages.guita.org/extensions/index.json';

/** Where the index's Ed25519 signature over its exact bytes lives, beside it. */
export const MARKETPLACE_SIGNATURE_URL = `${MARKETPLACE_INDEX_URL}.sig`;

/** The longest an index may be, in bytes; YapYap refuses a longer one unread. */
export const MARKETPLACE_INDEX_MAX_BYTES = 2 * 1024 * 1024;

/** How long a signed index stays valid at most, 30 days, so a frozen copy stops working. */
export const MARKETPLACE_MAX_VALIDITY_MS = 2_592_000_000;

/** The file name of a listed version's archive, as it is published. */
export const marketplaceArchiveName = (id: string, version: string): string =>
  `${id}-${version}.yapyap-extension`;

/**
 * Where a listed version's archive downloads from: always beside the index,
 * never a third party's server (ADR 0014).
 */
export const marketplaceArchiveUrl = (id: string, version: string): string =>
  `https://packages.guita.org/extensions/${id}/${marketplaceArchiveName(id, version)}`;

const { id: ExtensionId, version: Version, name: Name, author: Author } = ManifestSchema.properties;
const Fingerprint = Type.String({ pattern: '^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$' });
const Time = Type.String({ format: 'date-time', maxLength: 40 });
/** A capability or host the version asks for; newer YapYap versions may list kinds this one does not know. */
const Grant = Type.String({ pattern: '^[a-z0-9][a-z0-9.:-]*$', maxLength: 260 });

const MarketplaceVersion = Type.Object(
  {
    version: Version,
    // The archive limit of ADR 0004: 20 MiB.
    size: Type.Integer({ minimum: 1, maximum: 20_971_520 }),
    sha256: Type.String({ pattern: '^sha256-[A-Za-z0-9+/]{43}=$' }),
    capabilities: Type.Array(Grant, { maxItems: 64 }),
    hosts: Type.Array(Grant, { maxItems: 32 }),
    minYapYap: Version,
    published: Time,
    /** What changed in this version, as plain text for people (#434). */
    notes: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
  },
  { additionalProperties: false },
);

const Https = Type.String({ pattern: '^https://', maxLength: 300 });

/**
 * A plain HTTPS address with a host and a path: no credentials, no fragment,
 * no spaces. It always serves the author's latest archive (ADR 0014).
 */
const LatestUrl = Type.String({
  pattern: String.raw`^https://[a-z0-9.-]+(?::[0-9]{1,5})?/[^\s#@]*$`,
  maxLength: 400,
});

/** What every listed extension has, official or not. */
const listed = {
  id: ExtensionId,
  name: Name,
  summary: Type.String({ minLength: 1, maxLength: 300 }),
  author: Author,
  homepage: Https,
  license: Type.String({ pattern: '^[A-Za-z0-9.+() -]{1,100}$' }),
  signer: Fingerprint,
  /** Pictures of the extension in use, served beside the index (#434). */
  screenshots: Type.Optional(
    Type.Array(
      Type.Object(
        {
          url: Type.String({
            pattern: String.raw`^https://packages\.guita\.org/extensions/`,
            maxLength: 300,
          }),
          caption: Type.String({ minLength: 1, maxLength: 200 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 5 },
    ),
  ),
};

/** YapYap's own extension: each version pinned by its size and SHA-256, beside the index. */
const OfficialExtension = Type.Object(
  {
    ...listed,
    review: Type.Literal('official'),
    versions: Type.Array(MarketplaceVersion, { minItems: 1, maxItems: 50 }),
  },
  { additionalProperties: false },
);

/**
 * A third-party extension nobody reviewed: whatever its `latest` address
 * serves, as long as `signer`'s key signed it for this ID (ADR 0014).
 */
const UnreviewedExtension = Type.Object(
  {
    ...listed,
    review: Type.Literal('unreviewed'),
    latest: LatestUrl,
    /** Where the extension's source code lives. */
    repository: Type.Optional(Https),
  },
  { additionalProperties: false },
);

const Revocation = Type.Object(
  {
    id: ExtensionId,
    versions: Type.Union([Type.Literal('*'), Type.Array(Version, { minItems: 1, maxItems: 50 })]),
    signer: Fingerprint,
    reason: Type.String({ minLength: 1, maxLength: 300 }),
  },
  { additionalProperties: false },
);

/**
 * The extension marketplace's index (ADR 0014): the official extensions,
 * each version's archive hash, the unreviewed third-party extensions, each
 * with its latest-release address and its author's key, and the versions
 * pulled since.
 * YapYap trusts it only with a valid signature from a first-party key, a
 * `serial` no lower than the last one it accepted, and an unexpired
 * `expires`.
 */
export const MarketplaceIndexSchema = Type.Object(
  {
    format: Type.Literal(2),
    serial: Type.Integer({ minimum: 1 }),
    generated: Time,
    expires: Time,
    extensions: Type.Array(Type.Union([OfficialExtension, UnreviewedExtension]), {
      maxItems: 1000,
    }),
    revoked: Type.Array(Revocation, { maxItems: 1000 }),
  },
  { additionalProperties: false },
);

/** The extension marketplace's index; see {@link MarketplaceIndexSchema}. */
export type MarketplaceIndex = Static<typeof MarketplaceIndexSchema>;

/** A revocation in the index; see {@link MarketplaceIndexSchema}. */
export type MarketplaceRevocation = MarketplaceIndex['revoked'][number];

/**
 * The revocation that pulls this version of an extension, if any (ADR 0014).
 * It must name the same ID and the same signing key, so nobody can pull
 * someone else's extension by reusing its ID.
 */
export function revocationOf(
  index: MarketplaceIndex,
  id: string,
  signer: string,
  version: string,
): MarketplaceRevocation | undefined {
  return index.revoked.find(
    (revocation) =>
      revocation.id === id &&
      revocation.signer === signer &&
      (revocation.versions === '*' || revocation.versions.includes(version)),
  );
}

/** How far ahead of the reader's clock a signed index may be, for a clock that runs late. */
const CLOCK_SKEW_MS = 86_400_000;

/** Whether the index was signed recently, has not expired, and is valid no longer than allowed. */
function isCurrent(index: MarketplaceIndex, now: Date): boolean {
  const generated = Date.parse(index.generated);
  const expires = Date.parse(index.expires);
  return (
    generated <= now.getTime() + CLOCK_SKEW_MS &&
    expires > now.getTime() &&
    expires - generated <= MARKETPLACE_MAX_VALIDITY_MS
  );
}

function parseIndex(text: string): MarketplaceIndex | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return Value.Check(MarketplaceIndexSchema, value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** An index's text once read: usable, or why not. */
export type MarketplaceIndexReading =
  | { readonly status: 'ready'; readonly index: MarketplaceIndex }
  /** Not an index, or, as the reader decides, too large or not signed by a trusted key. */
  | { readonly status: 'invalid' }
  /** Past its expiry, signed too far in the future, or valid for too long. */
  | { readonly status: 'outdated' };

/**
 * Reads the text of an index whose size and signature the reader already
 * checked (ADR 0014): it must match {@link MarketplaceIndexSchema} and be
 * current at `now`.
 */
export function readMarketplaceIndex(text: string, now: Date): MarketplaceIndexReading {
  const index = parseIndex(text);
  if (index === undefined) {
    return { status: 'invalid' };
  }
  return isCurrent(index, now) ? { status: 'ready', index } : { status: 'outdated' };
}
