import { Type, type Static } from 'typebox';

/**
 * What an extension can ask for (ADR 0004). Network access is declared host by
 * host in `network.hosts` instead, and each host becomes its own grant.
 */
export const CAPABILITIES = [
  'chat:read-active',
  'chat:read-unread-summary',
  'composer:insert-draft',
  'composer:read-draft',
  'notifications:show',
  'storage:local',
  'secrets:own',
  'local-network',
] as const;

/** One of {@link CAPABILITIES}. */
export type Capability = (typeof CAPABILITIES)[number];

/** Where the published schema lives, so editors can validate manifests. */
export const MANIFEST_SCHEMA_ID = 'https://yapyap.guita.org/schema/manifest.schema.json';

const SEMVER = String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$`;
const IDENTIFIER = '^[a-z][a-z0-9-]*$';
/** A file inside the extension: relative, `/`-separated, never climbing out. */
const EXTENSION_FILE = String.raw`^(?!/)(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9._/-]+\.m?js$`;
const HOSTNAME = String.raw`^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`;
const BASE64 = '^[A-Za-z0-9+/]+={0,2}$';

const Title = Type.String({ minLength: 1, maxLength: 64 });
const CommandId = Type.String({ pattern: IDENTIFIER, maxLength: 64 });

const Command = Type.Object(
  { id: CommandId, title: Title },
  { additionalProperties: false, description: 'An action the user can run from YapYap.' },
);

const CommandReference = Type.Object(
  { title: Title, command: CommandId },
  { additionalProperties: false },
);

const ContextMenuItem = Type.Object(
  {
    title: Title,
    command: CommandId,
    on: Type.Union([Type.Literal('message'), Type.Literal('chat')]),
  },
  { additionalProperties: false },
);

/** The manifest schema, as TypeBox; the published JSON Schema is generated from it. */
export const ManifestSchema = Type.Object(
  {
    id: Type.String({
      pattern: String.raw`^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$`,
      maxLength: 128,
      description: 'Reverse-DNS identifier, such as org.example.translate.',
    }),
    name: Title,
    version: Type.String({ pattern: SEMVER, description: 'Semantic version.' }),
    description: Type.Optional(Type.String({ maxLength: 300 })),
    author: Type.Object(
      {
        name: Type.String({ minLength: 1, maxLength: 100 }),
        url: Type.Optional(Type.String({ pattern: '^https://', maxLength: 300 })),
      },
      { additionalProperties: false },
    ),
    apiVersion: Type.String({
      pattern: String.raw`^[\^~]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`,
      description: 'The SDK versions the extension works with: exact, ^ or ~.',
    }),
    entry: Type.String({ pattern: EXTENSION_FILE, maxLength: 200 }),
    capabilities: Type.Array(
      Type.Union([
        Type.Literal('chat:read-active'),
        Type.Literal('chat:read-unread-summary'),
        Type.Literal('composer:insert-draft'),
        Type.Literal('composer:read-draft'),
        Type.Literal('notifications:show'),
        Type.Literal('storage:local'),
        Type.Literal('secrets:own'),
        Type.Literal('local-network'),
      ]),
      { uniqueItems: true },
    ),
    network: Type.Optional(
      Type.Object(
        {
          hosts: Type.Array(Type.String({ pattern: HOSTNAME }), {
            uniqueItems: true,
            maxItems: 32,
            description: 'HTTPS hosts the extension may reach; nothing else is allowed.',
          }),
        },
        { additionalProperties: false },
      ),
    ),
    contributes: Type.Optional(
      Type.Object(
        {
          commands: Type.Optional(Type.Array(Command, { maxItems: 32 })),
          composerActions: Type.Optional(Type.Array(CommandReference, { maxItems: 8 })),
          contextMenu: Type.Optional(Type.Array(ContextMenuItem, { maxItems: 16 })),
          settings: Type.Optional(
            Type.Record(Type.String(), Type.Unknown(), {
              description: 'A JSON Schema for the extension settings form YapYap renders.',
            }),
          ),
          panel: Type.Optional(
            Type.Object(
              { title: Title, entry: Type.String({ pattern: EXTENSION_FILE, maxLength: 200 }) },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    signature: Type.Optional(
      Type.Object(
        {
          publicKey: Type.String({ pattern: BASE64, description: 'Base64 SPKI DER.' }),
          algorithm: Type.Literal('ed25519'),
          value: Type.String({ pattern: BASE64 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  {
    $id: MANIFEST_SCHEMA_ID,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'YapYap extension manifest',
    additionalProperties: false,
  },
);

/** An extension's `manifest.json`, as {@link ManifestSchema} describes it. */
export type Manifest = Static<typeof ManifestSchema>;
