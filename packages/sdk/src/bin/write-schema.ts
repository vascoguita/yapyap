import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestSchemaJson } from '../schema-file.ts';

// The SDK ships the schema, and the docs site serves it at its $id.
for (const target of [
  'schema/manifest.schema.json',
  '../../docs/public/schema/manifest.schema.json',
]) {
  writeFileSync(join(import.meta.dirname, '..', '..', target), manifestSchemaJson());
}
