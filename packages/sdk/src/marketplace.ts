import { Type, type Static } from 'typebox';
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

const MarketplaceExtension = Type.Object(
  {
    id: ExtensionId,
    name: Name,
    summary: Type.String({ minLength: 1, maxLength: 300 }),
    author: Author,
    homepage: Type.String({ pattern: '^https://', maxLength: 300 }),
    license: Type.String({ pattern: '^[A-Za-z0-9.+() -]{1,100}$' }),
    review: Type.Union([Type.Literal('official'), Type.Literal('reviewed')]),
    signer: Fingerprint,
    versions: Type.Array(MarketplaceVersion, { minItems: 1, maxItems: 50 }),
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
 * The extension marketplace's index (ADR 0014): the official and reviewed
 * extensions, each version's archive hash, and the versions pulled since.
 * YapYap trusts it only with a valid signature from a first-party key, a
 * `serial` no lower than the last one it accepted, and an unexpired
 * `expires`.
 */
export const MarketplaceIndexSchema = Type.Object(
  {
    format: Type.Literal(1),
    serial: Type.Integer({ minimum: 1 }),
    generated: Time,
    expires: Time,
    extensions: Type.Array(MarketplaceExtension, { maxItems: 1000 }),
    revoked: Type.Array(Revocation, { maxItems: 1000 }),
  },
  { additionalProperties: false },
);

/** The extension marketplace's index; see {@link MarketplaceIndexSchema}. */
export type MarketplaceIndex = Static<typeof MarketplaceIndexSchema>;
