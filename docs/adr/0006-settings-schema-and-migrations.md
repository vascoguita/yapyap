# 0006. Settings schema and migrations

- Status: Accepted
- Date: 2026-10-18

## Context

Settings outlive app versions. A corrupt or outdated settings file must never
stop YapYap from launching. Users want to move their preferences between
machines, but sessions, cookies and secrets must never leave the machine
through an export.

## Decision

- **Storage**: `<userData>/settings.json`, written atomically (write temp, fsync,
  rename). The previous good file is kept as `settings.json.bak`.
- **Shape**: `{ "schemaVersion": n, ... }` described by a TypeBox schema in
  `apps/desktop/src/main/settings/schema.ts`. The TS type is derived from the
  schema, so there is one source of truth.
- **Migrations**: an ordered array of pure functions
  `migrate[n]: (vN) => vN+1`. Each has its own fixture-based test, and a
  property test checks that any valid older version migrates to a valid
  current one. Migrations are forward-only. If a file is newer than the app,
  it is opened read-only and the user is warned before anything is
  overwritten.
- **Load algorithm**: parse → migrate → validate → apply defaults for
  missing keys. On failure: try `.bak`. If that fails too, start with
  defaults, keep the bad file as `settings.corrupt-<timestamp>.json`, and
  show a notice. Launch never fails because of settings.
- **Repair**: missing values take their defaults and only invalid values are
  reset (TypeBox `Value.Default`, then `Value.Repair`), so one bad value never
  costs the others. Unknown keys are dropped. Sections are added as the
  features that own them land, each with a migration once the schema version
  is past 1.
- **Sections**: `general` (language, startMinimized, closeToTray, autostart),
  `appearance` (theme, zoom default), `notifications` (enabled, dnd,
  showPreview, sound), `accounts[]` (id, name, color, partition, muted, zoom,
  customCss/Js refs), `shortcuts`, `downloads` (mode ask|auto, directory,
  openAfter), `spellcheck` (enabled, languages), `network` (proxy mode/rules),
  `reliability` (memoryWatchdog threshold, hardwareAcceleration,
  safeMode), `privacy` (crashReports: off|local|ask), `advanced`
  (customCode enabled, developerMode), `plugins` (enabled, grants per
  account, pinned keys, approved hosts).
- **Export/import**: export writes
  `{ "format": "yapyap-settings", "settings": { "schemaVersion": n, ... } }`,
  holding only the sections in an explicit allowlist (`EXPORTED_SECTIONS` in
  `settings/transfer.ts`), cleaned of keys the schema does not define. A
  test fails whenever the schema gains a section the allowlist has not
  classified. Partition names, plugin secrets, cookies, pinned keys and
  anything under `secrets` are never exported; a section holding them stays
  out of exports and keeps its current values on import (`LOCAL_SECTIONS`).
  The `plugins` section is one: Developer Mode must not arrive in a file. Import reads at
  most 64 KiB, requires the format marker, runs the same
  migrate-and-validate pipeline, refuses files from a newer schema, and asks
  before replacing. It is unavailable while the settings are read-only.
- **Secrets**: never stored in `settings.json`. Electron `safeStorage`
  ciphertext lives in `<userData>/secrets/<namespace>.bin`.

## Consequences

- Every settings change that alters shape needs a migration, a schema version
  bump, and a test. CI checks that `schemaVersion` matches the number of
  migrations.
