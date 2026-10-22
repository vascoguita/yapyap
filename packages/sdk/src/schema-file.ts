import { ManifestSchema } from './manifest.ts';

/** The published `manifest.schema.json`: the TypeBox schema as plain JSON Schema. */
export function manifestSchemaJson(): string {
  return `${JSON.stringify(ManifestSchema, null, 2)}\n`;
}
