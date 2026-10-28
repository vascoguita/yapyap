# extension-sdk

Types and the manifest schema for YapYap extensions (ADR 0004).

- `ManifestSchema` and `Manifest`: the `manifest.json` format, as a TypeBox
  schema. `schema/manifest.schema.json` is generated from it with
  `pnpm --filter @yapyap/extension-sdk schema`, and the docs site serves the same
  file at https://yapyap.guita.org/schema/manifest.schema.json.
- `CAPABILITIES`: what an extension can ask for.
- `defineExtension` and `ExtensionHost`: the typed host API an extension receives.

See the [extension manifest guide](https://yapyap.guita.org/extensions/manifest).
