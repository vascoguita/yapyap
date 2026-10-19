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
- **Sections**: `general` (language, startMinimized, closeToTray, autostart),
  `appearance` (theme, zoom default), `notifications` (enabled, dnd,
  showPreview, sound), `accounts[]` (id, name, color, partition, muted, zoom,
  customCss/Js refs), `shortcuts`, `downloads` (mode ask|auto, directory,
  openAfter), `spellcheck` (enabled, languages), `network` (proxy mode/rules),
  `reliability` (memoryWatchdog threshold, hardwareAcceleration,
  safeMode), `privacy` (crashReports: off|local|ask), `advanced`
  (customCode enabled, developerMode), `plugins` (enabled, grants per
  account, pinned keys, approved hosts).
- **Export/import**: export writes a JSON file that keeps `schemaVersion` and
  passes through an explicit allowlist serializer. Partition names, plugin
  secrets, cookies, pinned keys and anything under `secrets` are never
  exported. Import runs the same migrate-and-validate pipeline and asks
  before replacing.
- **Secrets**: never stored in `settings.json`. Electron `safeStorage`
  ciphertext lives in `<userData>/secrets/<namespace>.bin`.

## Consequences

- Every settings change that alters shape needs a migration, a schema version
  bump, and a test. CI checks that `schemaVersion` matches the number of
  migrations.
