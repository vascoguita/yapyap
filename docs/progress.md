# Progress

- **Current milestone:** M2 · Single-account shell
- **Last merged PR:** #171 (sandbox refusal)
- **Next issue:** #53 (performance), #55 (i18n), #37 (memory watchdog), #39 (crash reports), #41 (display backend)
- **Open blockers:** #22 (automation GitHub App), #23, #24, #25 need maintainer-provided secrets or settings (pipelines skip those steps gracefully). #138 (OpenSSF Best Practices badge) needs release notes, so it passes only after v0.1.0

## Milestones

| Milestone                                            | Status      |
| ---------------------------------------------------- | ----------- |
| M0 · Research and ADRs                               | Done        |
| M1 · Bootstrap                                       | Done        |
| M2 · Single-account shell                            | In progress |
| M3 · Accounts, tray, notifications, updates (v0.1.0) | Not started |
| M4 · Remaining desktop features (v0.1.x)             | Not started |
| M5 · Plugin platform                                 | Not started |
| M6 · AI writing assistant (v0.2.0)                   | Not started |
| M7 · Hardening                                       | Not started |
| M8 · Docs and v1.0.0                                 | Not started |

## Notes

Notes are sorted by the first issue they cite. Add a note where its issue
number belongs, not at the top, so pull requests for different issues do
not edit the same lines.

- The WhatsApp adapter reads the page view (loading, logged out, chats),
  whether a chat is open and the unread count, on demand and from a versioned
  landmark table; Copy Diagnostics shows the view (#32). An E2E test keeps
  typing latency under budget while the probe runs.

- Renderer memory watchdog (#37): `reliability.memoryWatchdogMb` (file only)
  reloads the WhatsApp renderer after two minutes over the limit, but not
  while the user is busy in the window unless it passes 1.5× the limit
  (ADR 0008, C19).

- Opt-in local crash reports (#39): a session marker (`running.json`) detects
  unclean exits; with `privacy.crashReports` on, YapYap saves a redacted text
  report and, when set to `ask`, offers to review it and open a prefilled
  GitHub issue. Nothing is sent automatically.

- Linux display backend (#41): `reliability.displayBackend` (settings schema
  v2, the first migration) picks Wayland or X11; `--ozone-platform` and
  `ELECTRON_OZONE_PLATFORM_HINT` win over it. Diagnostics show the backend,
  and the portal picker follows it. CI checks both backends paint.

- Settings export and import (#43) live in the Settings window's Backup
  section. A new settings section must be classified in `EXPORTED_SECTIONS`
  (`settings/transfer.ts`); a test fails until it is.

- Message catalogs (#55, part 1): every string the chrome windows show,
  including setting labels, lives in `src/shared/messages/en.ts`. Other
  languages will be typed as `Messages`, so a missing key fails to compile;
  `yapyap/no-literal-ui-text` rejects literal text in renderer JSX. Menus,
  dialogs and notifications move in a later part.

- Chats stay unread while hidden (#66): `privacy.unreadWhileHidden` (settings
  schema v3) keeps background throttling on, so a hidden or minimized
  window's page reports itself hidden; verified on real Wayland and X11
  sessions, since Playwright keeps the pages it drives active.

- Update policy (#68): `decideUpdatePolicy` maps the stamped install channel
  and runtime evidence (`APPIMAGE`, `PORTABLE_EXECUTABLE_DIR`, Flatpak
  markers, a Developer ID signature) to `self-update`, `notify`, `system` or
  `manual`; Copy Diagnostics shows it. The updater (#69) will read it.

- Release notices (#70): builds with the `notify` policy (portable, unsigned
  macOS) check GitHub's latest stable release at startup and daily and show
  a notification that opens the release page; nothing is downloaded, and
  other policies never make the request.

- Account → New Chat with Number… (#80) opens a small chrome window; the
  number is parsed by `src/shared/phone-number.ts` in the window and again in
  main, then opened as WhatsApp's own chat link. Nothing is stored.

- Plugin SDK (#88): `@yapyap/plugin-sdk` defines the manifest as a TypeBox
  schema (the published `manifest.schema.json` is generated from it and
  tested to match) and the typed host API, one interface per capability. The
  docs site documents the manifest at `/plugins/manifest`.

- Plugin signing (#89): `packages/plugin-sign` signs and verifies unpacked
  plugin folders as ADR 0004 specifies (canonical JSON of the manifest and
  file digests, Ed25519, fingerprints of the raw key). Tests use keys made in
  memory per run. Signing first-party plugins in CI waits for the first real
  plugin (#101).

- Plugin trust (#90): `packages/plugin-sign` now decides trust (`decideTrust`:
  first-party IDs need an embedded anchor, third-party keys are pinned on
  first install, other keys are rejected), checks URL-install integrity and
  reads and writes pins. The anchors live in `src/anchors.ts`, and CI checks
  the first matches `PLUGIN_SIGNING_PUBLIC_KEY`. The installer (#91) wires
  it into the app.

- The screen picker lists screens and windows in separate calls (#180),
  because one combined call came back empty on Linux CI while screens alone
  were listed.

- The SonarQube Cloud backlog is fixed; the few per-file exceptions, each with
  its reason, are in `sonar-project.properties` (ADR 0010, #185).

- ESLint requires braces on every block (`curly: all`), matching SonarQube
  Cloud's strict profile (#185).

- SonarQube Cloud analyzes every PR and `master` (ADR 0010). Overall code
  has no open issues, so `SonarQube Cloud` is a required check and the README
  shows its badges (#185). The project now uses the built-in "Sonar way for
  Agentic AI" gate; Vitest still enforces 100% coverage.

- E2E tests that use a fake-page control wired up by a script (popups,
  screen sharing, paste) wait for the page's `load` event first; the controls
  render before their handlers (#188).

- When the Windows popup test fails, its message lists what the popup did
  (#188), so the remaining Windows case can be diagnosed.

- A popup's navigation is routed even when `will-navigate` never reports it,
  as happens on Windows: a timer checks where the popup is heading or what it
  shows every second, and a late `will-navigate` never routes it twice (#188).

- Sponsorships go through GitHub Sponsors (`.github/FUNDING.yml`), linked from
  the README, the site navigation, the install guide and the About window (#196).
  They pay for the Claude subscription used to develop YapYap and for code
  signing (README, Support YapYap).

- macOS and Windows releases ship unsigned until donations (#196) fund code
  signing (#23, #24); the install guide explains the first launch.

- CI is cheaper per pull request (ADR 0007): documentation-only changes skip
  tests, E2E, mutation, Sonar and packaging; code changes package one format
  per system; mutation runs only the tests that import the mutated files; the
  required checks are `CI result` plus the other workflows' checks, and
  branches need not be up to date. #210 restores the full matrix and the
  up-to-date rule in M7.

- The release PR is paused until the first release is near: release-please
  runs only when the `RELEASES_ENABLED` variable is `true` (CONTRIBUTING,
  Releases).

- Ensita supports YapYap's development and is credited in the README, the
  site footer and the About window.

- The Windows paste E2E test retries its paste, because Windows can refuse the
  focus a test asks for.

- The docs site is served at https://yapyap.guita.org: a DNS-only Cloudflare CNAME
  to `vascoguita.github.io`, set as the GitHub Pages custom domain. The app ID
  is `org.guita.YapYap`, which Flathub verifies at guita.org (redirected to the site).

- The website marks unshipped features as planned. When a feature ships,
  drop its "(planned)" marker on the home page and add its settings, files
  and flags to `docs/guide/reference.md`.

- Build-only advisories without an upstream fix are resolved with `overrides` in
  `pnpm-workspace.yaml`, each with a comment explaining why.
