# plugin-sdk

Types and the manifest schema for YapYap plugins (ADR 0004).

- `ManifestSchema` and `Manifest`: the `manifest.json` format, as a TypeBox
  schema. `schema/manifest.schema.json` is generated from it with
  `pnpm --filter @yapyap/plugin-sdk schema`, and the docs site serves the same
  file at https://yapyap.guita.org/schema/manifest.schema.json.
- `CAPABILITIES`: what a plugin can ask for.
- `definePlugin` and `PluginHost`: the typed host API a plugin receives.

See the [plugin manifest guide](https://yapyap.guita.org/plugins/manifest).
