import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANIFEST_SCHEMA_ID } from './manifest.ts';
import { manifestSchemaJson } from './schema-file.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe('the published manifest schema', () => {
  it('matches the TypeBox schema (regenerate with pnpm --filter @yapyap/extension-sdk schema)', () => {
    expect(readFileSync(join(ROOT, 'packages/sdk/schema/manifest.schema.json'), 'utf8')).toBe(
      manifestSchemaJson(),
    );
  });

  it('is plain JSON Schema with its public $id', () => {
    const schema = JSON.parse(manifestSchemaJson()) as Record<string, unknown>;
    expect(schema['$id']).toBe(MANIFEST_SCHEMA_ID);
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema['additionalProperties']).toBe(false);
  });
});
