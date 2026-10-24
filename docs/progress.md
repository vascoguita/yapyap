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

- Account sidebar (#57): with two or more running accounts, a chrome page
  (`sidebar.html`) docks on the main window's left edge (`createSidebarView`,
  which insets every account view and overlay beside it). It lists the
  running accounts in menu order with an initial avatar in their color, an
  unread badge (none for muted accounts, which show a muted mark instead)
  and a do not disturb note; a click switches without reloading. The main
  process pushes each new state on one channel (`sidebar:state-changed`)
  and checks that a switch names a listed account (`sidebarHandlers`).
  `appearance.compactSidebar` (settings schema v8), from the sidebar's own
  button or Settings, shows avatars only in a 64 px strip.

- Account management (#58): the Accounts window (`accounts.html`, Account →
  Manage Accounts…) renames, recolors, turns off and removes accounts. Edits
  are a draft until saved, and Escape or picking another account asks before
  discarding one. The main process checks every change again
  (`accountsHandlers`) and asks before removing. Turning an account off
  closes its views and keeps its data; turning it on opens and loads it
  (`runAccounts().update`). Accounts that are off are left out of the menu.
  The color stands in for an avatar until profile photos (#87).

- Notifications (#59): WhatsApp's views have a preload (ADR 0011) that
  replaces the page's `Notification` with a stand-in before any page script
  runs (`installNotificationShim`, sent with `executeInMainWorld`, so it must
  stay self-contained). The main process accepts its messages only from a
  WhatsApp view on WhatsApp's origin (`listenForNotifications`), checks and
  rate-limits them per account (`accountNotifier`), and shows system
  notifications headed by the account's name when there are several. A
  click switches to the account and lets the page open the chat; closing in
  the page, removing the account or quitting withdraws them. The fake page
  shows notifications through the Web API (`notify.js`).

- Notification replies (#60): on macOS and Windows notifications offer an
  inline reply (`hasReply`). A reply opens its chat as a click does, then
  `draftReply` focuses WhatsApp's message box through the adapter's new
  `composer` landmark (`FOCUS_COMPOSER`, landmarks v2) and types the reply
  with `insertText`, unsent: the user sends it (ADR 0008, C22). Linux keeps
  opening the chat on a click.

- Do not disturb and per-account mute (#61): `general.doNotDisturb`
  (settings schema v7) and an optional `muted` flag per account in
  `accounts.json` (old files stay valid) silence notifications in
  `accountNotifier` before the rate limit. `quietAudio` mutes the page audio
  of every silenced account except the one on screen; it runs again when
  the window is shown, hidden, minimized or restored, when accounts change
  and when settings change (ADR 0008, C20). The window's visibility comes from its
  events (`trackVisibility`), since macOS still reports a window visible
  while its `hide` event runs; the tray's Show and Hide follow it too. Do not disturb is in the tray,
  the Account menu and Settings; Mute This Account is in the Account menu
  and the Accounts window, and the tray and the sidebar (#57) mark muted
  accounts.

- Notification privacy (#62): `privacy.notificationSender` and
  `privacy.notificationText` (settings schema v6) replace the sender with
  “WhatsApp” and the text with “New message” before anything reaches the
  system; images are never shown (ADR 0011).

- Tray menu (#63, first part): the tray shows or hides the window (the
  label follows the window), switches between running accounts, opens
  Settings and quits; its tooltip, and the macOS menu bar title, show the
  unread count of every account. On macOS a click opens the menu, as menu
  bar items do. Chrome windows now share one opener each, so a rebuilt menu
  or the tray never opens a second copy.

- Symbolic tray icon (#63, second part): `appearance.trayIcon` (settings
  schema v9) keeps the app icon (`color`, the default) or shows a one-color
  silhouette of it, drawn at run time (`drawSymbolicIcon`), in a light or
  dark shade or `auto`matically: the shade that stands out against the
  panel, from `nativeTheme` (the taskbar's own setting on Windows). On macOS
  every one-color choice is a template image. The icon follows setting and
  scheme changes live (`followTrayIconSetting`). GNOME needs the
  AppIndicator extension; panels themselves are checked by hand (guide).

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

- Call windows (#67): a popup on WhatsApp's own origin, opened directly or
  as `about:blank` that then goes there, is shown as a window of its
  account instead of being loaded into the account's view or discarded. It
  inherits the opener's zone and home (`inherit` in the navigation guard),
  so its own guards, permissions and screen-sharing rules treat it like the
  account, and it closes, never destroyed, when the account's page goes.
  The fake page opens calls both ways (`call.js`, `call.html`).

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

- Spell checking, first part (#73): a context menu on account views (cut,
  copy, paste, select all; Copy for selected text elsewhere) with up to five
  suggestions, Add to Dictionary and a spelling toggle. `spelling.enabled`
  is off by default (ADR 0008, C24); while it is off sessions list no
  language, so nothing is fetched. Once on, `followSpellingSetting` checks
  `spelling.languages` or the first system language with a dictionary;
  macOS uses its own checker. The Spelling Languages window (second part,
  `spelling-languages.html`, from the menu's Languages…) lists Chromium's
  dictionaries by their own and English names (`Intl.DisplayNames`),
  searchable without accents, chosen ones first, at most ten; the
  `spelling:choose` handler accepts only distinct languages that have a
  dictionary.

- Download options, first part (#74): `downloads.askWhere` hands the path
  to Chromium's save dialog, which starts in the folder last chosen
  (`downloads.json`, state rather than a setting); `downloads.openWhenDone`
  opens a finished file only if its extension is on an allowlist of types
  that display and never run (`opensSafely`). A download YapYap cannot
  place safely is now asked about, and reported as saved. The downloads
  window with progress, pause and resume comes next.

- Keyboard shortcuts, first part (#75): `shared/shortcuts.ts` is the one
  table of shortcuts, with macOS keys where they differ and platforms where
  only some have them. The menus take every accelerator from it, so the
  Edit and Window menus are built item by item (plain-text paste included)
  instead of from Electron's roles. Help → Keyboard Shortcuts… (Ctrl+/)
  lists them with the system's own keys; `shortcuts.spec.ts` checks that
  each listed shortcut is on a menu item. Changing shortcuts and global
  shortcuts come next.

- Proxy, first part (#76): `network.proxyMode` (system, direct or manual)
  and `network.proxyServer`, in a new Network section with the first text
  field in Settings. `followProxySetting` applies them to the default
  session before release checks start, to every session `session-created`
  reports (electron-updater's included), and to each account's session
  before it loads. Changes apply at once and close older connections. A
  manual proxy without an address, or one Electron rejects, blocks
  connections instead of going direct, and the warning leaves the address
  out. Chromium's proxy options on the command line stand in for the
  system's settings, so they keep working. With a manual proxy, WebRTC sends only through it (ADR 0008, C23).
  Proxy passwords come in the second part.

- Site permissions (#77): each account's session guard now hands back what
  it remembers (`PermissionMemory`), and the Accounts window shows, for a
  running account, whether the camera and microphone are allowed until
  YapYap quits or ask first, with a button that forgets those answers.
  Notifications are always allowed and screen sharing asks every time, so
  there is nothing else to reset.

- Account → New Chat with Number… (#80) opens a small chrome window; the
  number is parsed by `src/shared/phone-number.ts` in the window and again in
  main, then opened as WhatsApp's own chat link. Nothing is stored.

- Interface scale (#81): Settings → Appearance offers WhatsApp's zoom as an
  Interface scale choice from 50% to 200% (setting choices may now carry
  numbers), and `appearance.pinchZoom` (settings schema v12) turns off zoom
  by pinch or Ctrl with the wheel, which arrive as `zoom-changed`; the View
  menu still zooms.

- Guided problem report (#82): Help → Report a Problem… opens a window
  where the user describes the problem and reviews the sanitized
  diagnostics (the same report as Copy Diagnostics, for the first WhatsApp
  view). Copy and Open GitHub copies both and opens the bug form with them
  filled in (`bugReportUrl`, shared with crash reports); YapYap sends
  nothing itself.

- Cache and memory options (#83): `reliability.diskCacheMb` and
  `reliability.jsHeapMb` (settings schema v13) set Chromium's disk cache
  size and each page's JavaScript memory limit at launch
  (`applyResourceLimits`). Invalid values fall back to automatic, which
  leaves Chromium's own choice. Hidden accounts are already throttled by
  Chromium's background throttling, which `privacy.unreadWhileHidden` keeps
  on (reference guide).

- First-run welcome (#84): when no settings file exists, YapYap opens a
  short welcome (`welcome.html`) after its window, and saves the defaults so
  it never opens again. It reuses the Settings window's fields and checked
  operations for the theme, closing to the tray, starting at login and
  notification privacy, notes that YapYap is in English for now, and closes
  with Escape. E2E profiles get a settings file at launch, so only the
  welcome test sees a first run.

- Privacy screen (#85): `createPrivacyScreen` blurs every account's
  WhatsApp with inserted CSS that also takes clicks away, so it needs no
  knowledge of WhatsApp's page. It comes on from the tray or View → Privacy
  Screen (Ctrl/Cmd+Shift+H) until switched off, and, with
  `privacy.blurWhenUnfocused` or `privacy.blurWhenIdle` (settings schema
  v11), while the window is out of focus or the computer has been idle for
  five minutes. New accounts are covered as they open.

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

- Plugin consent (#91, third part): File → Install Plugin… (the app menu
  on macOS) picks an archive, reads at most one byte past the size limit,
  and runs `prepareInstall`; a consent window (`plugin-consent.html`, one
  at a time, answered only by its own window, `createPluginConsent`) shows
  the author, signing key, capabilities in plain words and hosts, marking
  what an update adds. For a third-party or unsigned plugin it says
  YapYap has not reviewed it and that it is installed at the user's own
  risk, and Install stays off until the user acknowledges this; the main
  process refuses an install without the acknowledgement too. The Plugins
  window (`plugins.html`) lists installed plugins marked By YapYap,
  Third-party or Unsigned, and warns while `plugins.developerMode`
  (settings schema v10, a new Plugins section) is on. That section is
  local: never exported, and kept as it is on import (`LOCAL_SECTIONS`).
  Running plugins comes with the plugin runtime.

- Screen-sharing indicator (#161): the WhatsApp preload's second stand-in
  (`installShareShim`, ADR 0011) reports when a screen share starts and
  ends, by a random ID only, and stops one when YapYap asks. The main
  process tracks shares per account (`trackShares`, which hears only
  WhatsApp pages and call windows of an account; views now carry their
  account, which call windows inherit), and the tray (a Stop Sharing Screen
  entry first in its menu, and its tooltip) and the sidebar (a Sharing
  button beside the account) show each one until it ends. Call windows now
  get the WhatsApp preload, so both stand-ins run in calls.

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
  thread and the helper processes. The sample showed Electron's modal error
  box for an uncaught error, raised by account views firing at a window that
  had closed; closing view pages with their window and logging process
  errors (#242) fixed it, and no macOS run has hung since. `quit.spec.ts`
  now quits as a user does, with a call window, the sidebar, Accounts and
  Settings open, and fails on every OS if YapYap is still running 15 s
  later.

- Electron is pinned to 44.9.3 (#262), which fixes GHSA-jr5w-w6x2-84p9
  (compromised eMudhra intermediate certificates) and lets the audit pass.
  Electron 45 is a new major version and comes in its own change.

- happy-dom, the DOM the unit tests run in, is pinned to 21.0.4 (#268),
  which fixes GHSA-834v-8h66-3h79. It is a test-only dependency, so builds
  were never affected; the audit passes again.

- Mutation gate for settings and chrome windows (#275): `decode.test.ts`
  writes out every value each choice accepts and checks unknown keys in
  every section, so schema literals no longer survive by changing the test
  with them. `readImport` answers a file that is not JSON with its own
  message ("damaged"), which also makes its parse error observable. A
  feature test pins the size and controls of YapYap's own windows.

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
