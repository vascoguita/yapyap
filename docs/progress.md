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
  and the portal picker follows it. CI checks both backends paint, polling
  until the window is shown and painted.

- Settings export and import (#43) live in the Settings window's Backup
  section. A new settings section must be classified in `EXPORTED_SECTIONS`
  (`settings/transfer.ts`); a test fails until it is.

- Message catalogs (#55, part 1): every string the chrome windows show,
  including setting labels, lives in `src/shared/messages/en.ts`. Other
  languages will be typed as `Messages`, so a missing key fails to compile;
  `yapyap/no-literal-ui-text` rejects literal text in renderer JSX.

- Message catalogs (#55, part 2): the main process takes its menus, dialogs,
  notifications, window titles and settings notices from the same catalog
  (`menu`, `windows`, `dialogs`, `notices`, `settings.backup` and
  `settings.loadNotices`). The product name stays data from `identity.ts`,
  passed to formatters. Log lines and the diagnostics and crash report text
  stay English, since they go into bug reports. Lint now also rejects
  literal text in the main process's `label`, `title`, `message`, `detail`,
  `body` and `buttons` properties.

- Account views (#56, second part): WhatsApp runs in a `WebContentsView`
  (`createAccountView`) beneath any overlay, in the account's partition; the
  main window's own page stays empty. Its title, unread count, readiness to
  show (`dom-ready`), focus (`focusPageWithWindow`) and chat links come from
  the view's page. E2E tests find it with `whatsAppPage`. A closed window
  closes its view's page, which Electron would otherwise leave running, and
  uncaught main-process errors are logged (`logProcessErrors`) instead of
  shown in Electron's modal box, which blocked quitting (#223). Several accounts
  come next.
  the view's page. E2E tests find it with `whatsAppPage`.

- Several accounts (#56, third part): every enabled account loads in its own
  view and partition (`runAccounts`, `createAccountHost`), and only the
  active one is attached, with its recovery screen; a hidden account's page
  counts as hidden, so it marks nothing read. The Account menu lists them
  (Ctrl/Cmd+1–9), adds one, and removes the active one after asking: its
  views close, its data is cleared, and its folder goes at the next start.
  The window title follows the active account and the badge sums all
  (`accountSignals`). Screen capture requires the page to be the one shown.
  Naming, colors and disabling come with #58, the sidebar with #57.

- Accounts (#56, first part): `accounts.json` lists the accounts (UUID,
  name, color, enabled, active), checked against a schema; a missing or
  damaged file is rebuilt from the `Partitions/account-<uuid>` folders, so no
  one is logged out by a bad file. WhatsApp runs in the active account's
  persistent partition, whose session gets the security and download guards;
  the default session loads nothing. `writeTextAtomically` is shared with
  the settings store. Several accounts and their views come next.

- Account management (#58): the Accounts window (`accounts.html`, Account →
  Manage Accounts…) renames, recolors, turns off and removes accounts. Edits
  are a draft until saved, and Escape or picking another account asks before
  discarding one. The main process checks every change again
  (`accountsHandlers`) and asks before removing. Turning an account off
  closes its views and keeps its data; turning it on opens and loads it
  (`runAccounts().update`). Accounts that are off are left out of the menu.
  The color stands in for an avatar until profile photos (#87).

- Tray menu (#63, first part): the tray shows or hides the window (the
  label follows the window), switches between running accounts, opens
  Settings and quits; its tooltip, and the macOS menu bar title, show the
  unread count of every account. On macOS a click opens the menu, as menu
  bar items do. Chrome windows now share one opener each, so a rebuilt menu
  or the tray never opens a second copy. Do not disturb (#61) and a symbolic
  icon that follows the system theme are still to come.

- Unread badge (#64): the count of unread chats in WhatsApp's title
  (`unreadInTitle` in the adapter, read on `page-title-updated`, so no page
  probe) becomes the Dock badge on macOS, the launcher count on Linux
  desktops that show one, and a taskbar overlay drawn in memory on Windows
  (`drawBadge`: a red disc with up to "9+", no image files).

- Tray (#65, first part): a tray icon with Show and Quit, **Close to the
  tray** (`general.closeToTray`, settings schema v4) and **Start minimized**.

- Start at login (#65, second part): `general.autostart` uses login items on
  Windows and macOS and an XDG autostart entry on Linux (the AppImage's own
  path, not its mount). The setting follows the system at startup, since
  users can remove login items there. A change runs as a setting effect
  (`settingsHandlers`) before it is saved; when the system refuses, the
  setting stays as it was and Settings explains why under it. Flatpak needs
  the Background portal (#234). E2E runs keep autostart entries in the
  throwaway profile through `XDG_CONFIG_HOME`.

- Chats stay unread while hidden (#66): `privacy.unreadWhileHidden` (settings
  schema v3) keeps background throttling on, so a hidden or minimized
  window's page reports itself hidden; verified on real Wayland and X11
  sessions, since Playwright keeps the pages it drives active.

- Update policy (#68): `decideUpdatePolicy` maps the stamped install channel
  and runtime evidence (`APPIMAGE`, `PORTABLE_EXECUTABLE_DIR`, Flatpak
  markers, a Developer ID signature) to `self-update`, `notify`, `system` or
  `manual`; Copy Diagnostics shows it. The updater (#69) will read it.

- Self-updates (#69): under the `self-update` policy (AppImage, NSIS, macOS
  with a Developer ID) electron-updater downloads stable upgrades in the
  background, verifies their SHA-512, and installs only after the user agrees
  to restart; pre-releases, downgrades and install-on-quit are off.

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

- Plugin archives (#91, first part): `readPluginArchive` reads a
  `.yapyap-plugin` ZIP in memory with fflate within size and entry limits,
  rejects unsafe paths and case collisions, and `verifyArchive` checks its
  signature before anything is written. Install storage and update approvals
  follow in the second part.

- Plugin installs (#91, second part): `apps/desktop/src/main/plugins/` checks
  the manifest against the SDK schema, decides each install with
  `decideTrust` (unsigned plugins only in Developer Mode, recorded as
  developer plugins), and builds the request the consent screen will show:
  author, key fingerprint, capabilities and hosts. Updates that add a
  capability or host need re-approval; dropped grants never do. Approved
  files are staged in a fresh folder and renamed into
  `<userData>/plugins/<id>/<version>/`, and grants and pinned keys live in one
  atomically written `.plugins.json`. The consent screen and the Developer
  Mode badge come with the plugin runtime UI.

- The screen picker lists screens and windows in separate calls (#180),
  because one combined call came back empty on Linux CI while screens alone
  were listed.

- Beta gate (#184, first part): the release PR gets a `Beta gate` check that
  fails until a `vX.Y.Z-beta.N` pre-release of its version has been out for
  3 days; `Security release: <reason>` in the PR skips the wait, never the
  beta.

- Beta releases (#184, second part): the manual **Beta release** workflow
  numbers and creates the next `vX.Y.Z-beta.N` pre-release and runs the
  shared package, smoke and publish workflows; `package.yml` takes the
  version to build.

- Beta updates (#184, third part): **Get beta updates**
  (`general.betaUpdates`, settings schema v5) makes self-updating builds set
  electron-updater's `allowPrerelease` before each check, and notify builds
  read the recent releases list instead of `/releases/latest`. Turning it
  off never downgrades. The setting is hidden where the system updates
  YapYap (`settingsIgnoredBy`, passed to `settingsHandlers`). Beta tester
  docs are in the install guide. Shipping v0.1.0 after a beta remains.

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

- E2E teardown reports a hanging quit (#223): if YapYap does not quit within
  30 s, the fixture kills it and fails with the windows it had and its last
  log lines, instead of an unexplained 60-second teardown timeout. Any app a
  test started and left running, because it failed or timed out first, is
  killed when the test ends, so none outlives a run on a developer's desktop. On macOS
  it also attaches `hung-at-quit.txt` to the report: a `sample` of every
  thread and the helper processes. So far it hung in specs with throttling
  on and off, with one visible WhatsApp window, after Playwright asked the
  app to quit.

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
