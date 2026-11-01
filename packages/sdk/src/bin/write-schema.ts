import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestSchemaJson } from '../schema-file.ts';

// The SDK ships the schema; the docs build copies it to serve it at its $id.
writeFileSync(
  join(import.meta.dirname, '..', '..', 'schema', 'manifest.schema.json'),
  manifestSchemaJson(),
);
