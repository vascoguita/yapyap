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

- macOS signing (#23): the first beta with Ensita's Developer ID secrets
  came out unsigned, because electron-builder skips signing while
  `CSC_IDENTITY_AUTO_DISCOVERY` is off, even with `CSC_LINK`. Release
  builds that have the certificate now turn discovery on, so electron-builder
  signs from the keychain it creates with only that certificate; other
  builds keep it off.

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

- First release docs (#71): the home page, guide, install guide and README
  stop calling YapYap unreleased and its accounts, notifications and plugins
  planned, link the changelog and the package repositories, and describe
  the Flatpak bundle as downloaded per release until Flathub (#119).

- Custom CSS and JavaScript (#72): **Custom CSS and JavaScript…** opens a
  chrome window (`custom-code:get`, `:save`, `:preview`) with a warning, an
  off-by-default switch, a scope (all accounts or one) and the two
  snippets. `createCustomCode` keeps them in `custom-code.json`, outside
  settings and their export; it inserts the CSS on every load and at once
  on save or preview (unsaved CSS shows as the user types and is taken
  back when the window closes), and runs each script in its own function
  and call in `CUSTOM_CODE_WORLD_ID`, logging only that one failed. Saving
  drops snippets that are empty or belong to removed accounts.

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
  Second part: Window → Downloads… (Ctrl+J, ⇧⌘J on macOS) opens a window
  listing this session's downloads (`createDownloadList`, newest first, at
  most fifty, in memory only) with progress and the actions each state
  allows: pause, resume, cancel, show in folder. A download is named to the
  page by an id, never by its path; the page refreshes every half second
  while open.
  Third part: `downloads.folder` (Settings → Save files to → Choose…)
  sends automatic downloads elsewhere; `downloadsFolder` falls back to the
  system's Downloads folder when the chosen one is gone or not a folder.
  Only the system's folder dialog can set it (`settings:choose-folder`);
  `settings:set` accepts nothing but the empty reset for a folder field.

- Keyboard shortcuts, first part (#75): `shared/shortcuts.ts` is the one
  table of shortcuts, with macOS keys where they differ and platforms where
  only some have them. The menus take every accelerator from it, so the
  Edit and Window menus are built item by item (plain-text paste included)
  instead of from Electron's roles. Help → Keyboard Shortcuts… (Ctrl+/)
  lists them with the system's own keys; `shortcuts.spec.ts` checks that
  each listed shortcut is on a menu item. Changing shortcuts and global
  shortcuts come next.
  Second part: each shortcut can be changed in that window (Change waits
  for the next keys; Escape keeps the old ones) and reset.
  `shortcuts.custom` keeps the user's keys by id, and the menu is built
  again when they change. Main refuses keys that do not fit
  (`isValidShortcut`: one key with modifiers, or a function key alone) and
  keys another action uses on this platform (`conflictOf`, which counts
  all nine account digits); keys in a hand-edited file that do not fit are
  ignored.
  Third part: `shortcuts.global.toggleWindow` (empty at first) is a
  shortcut that works from any app and shows or hides the window.
  `followGlobalShortcuts` registers it with `globalShortcut` when it is set
  and gives the keys back when they change and at quit; the window shows
  whether the system granted them (`globalShortcut.isRegistered`). It is
  checked against the in-app shortcuts both ways.

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
  Second part: a proxy that asks for a password opens Proxy Sign-In
  (`proxy-login.html`; `createProxyLogin` on the app's `login` event, proxy
  requests only). Saved credentials are tried once per session; refused ones
  bring the window back marked as failed; a cancel holds off new windows for
  a minute. Requests waiting on the same proxy share one window. Remembered
  credentials live in `secrets.json` through `openSecretStore` (`safeStorage`,
  file mode 0600), which keeps nothing where Linux falls back to
  `basic_text`. Neither the username nor the password is ever logged.
  Third part: an account can name its own proxy (`proxy` in accounts.json,
  same address rules, kept only when set) in the Accounts window. The proxy
  controller applies it to that account's session alone (`useAccounts`,
  re-applied when the account changes), and keeps that page's calls inside
  it (`guardCalls`). Pages that are gone are skipped.

- Site permissions (#77): each account's session guard now hands back what
  it remembers (`PermissionMemory`), and the Accounts window shows, for a
  running account, whether the camera and microphone are allowed until
  YapYap quits or ask first, with a button that forgets those answers.
  Notifications are always allowed and screen sharing asks every time, so
  there is nothing else to reset.

- Calls, microphone and camera (#78): on macOS, after YapYap's own question,
  `askMediaWithDialog` asks the system with `askForMediaAccess` and, if it
  refuses, says where to change that. The app bundle carries
  `NSMicrophoneUsageDescription`, `NSCameraUsageDescription` and its own
  entitlements (`build/entitlements.mac.plist`: JIT, audio input and camera,
  without electron-builder's default `disable-library-validation`). In
  Flatpak, `useCameraPortal` enables Chromium's `WebRtcPipeWireCamera`, so
  the camera goes through the Camera portal instead of a device grant. An
  E2E test with Chromium's fake devices checks that echo cancellation, noise
  suppression and gain control stay on.

- Chat list width (#79): the adapter (`src/adapter/chat-list-width.ts`)
  sets the inline `flex` of `#side`'s parent, WhatsApp's chat list column
  (landmarks v9), to the account's width, between 240 pixels and 60% of
  WhatsApp's width, and keeps a divider right after it in a closed shadow
  root. The divider is a `role="separator"` with its value and bounds,
  resized by a trusted mouse drag or the arrows, Home and End, and reset to
  WhatsApp's own width by a double-click or Enter. Its bridge
  (`yapyapChatList`, adapter world only) sends `resize` and `reset`; the
  main process keeps the width for the sending view's account in
  `chat-list.json`, state like `window-state.json` rather than a setting or
  a field of `accounts.json`, and drops it when the account is removed. The
  active account's page is sized when it comes on screen and about once a
  second while the window shows. The fake page now has WhatsApp's main
  screen: a flex row with the list in a `flex: 0 0 30%` column.

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

- Quick access panel (#86): `general.quickPanel` (off, always, while the
  window is hidden or minimized) and `general.quickPanelPlace` (where the
  user left it, kept in `quick-panel.json`, or a corner of the main screen).
  `createQuickPanel` opens an always-on-top chrome window that shows the
  sidebar's state with names, a Do Not Disturb switch, and
  `quick-panel:open`, which switches account and brings the main window
  back. On Wayland YapYap never positions it, and the settings snapshot's
  new `unavailable` map shows the position setting disabled with the reason.

- Account photos (#87): the adapter's `OWN_AVATAR` probe reads the address
  of the account's own profile photo (landmarks v4) when the page title
  changes. `accountAvatars` fetches it on the account's session, only over
  HTTPS from `*.whatsapp.net` or WhatsApp's origin and at most 2 MB, shrinks
  it to a 64-pixel PNG data URL in memory, and the sidebar shows it in place
  of the initial. It retries every minute until found, then every 30.

- Plugin SDK (#88): `@yapyap/plugin-sdk` defines the manifest as a TypeBox
  schema (the published `manifest.schema.json` is generated from it and
  tested to match) and the typed host API, one interface per capability. The
  docs site documents the manifest at `/plugins/manifest`.

- Plugin signing (#89): `packages/plugin-sign` signs and verifies unpacked
  plugin folders as ADR 0004 specifies (canonical JSON of the manifest and
  file digests, Ed25519, fingerprints of the raw key). Tests use keys made in
  memory per run. Signing first-party plugins in CI waits for the first real
  plugin (#101).

- First-party plugins signed in CI (#89, second part): the packaging
  workflow's **First-party plugins** job builds every plugin, and for a
  release signs each one under `org.guita.yapyap.` with the
  `PLUGIN_SIGNING_KEY` secret, which stays in memory
  (`scripts/src/bin/sign-plugins.ts`), refuses a key that is not a trust
  anchor, and packs `<id>-<version>.yapyap-plugin`. The publish job uploads,
  checksums and attests it with the other release assets.

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

- Plugin runtime (#92): `createPluginRuntime` starts every installed plugin
  at launch, and a new or updated one as soon as it is installed, in a
  hidden sandboxed window (`createHost`, never shown) on its own partition,
  `plugin:<id>` or `persist:plugin:<id>` with `storage:local`. Each
  plugin's session serves `plugin://<id>/` only from its install folder
  (`servePluginFiles`: a generated host page that loads `entry`, the plugin
  CSP and `nosniff` on every response, nothing outside the folder) and
  cancels every other request (`confinePluginRequests`; approved hosts
  follow in #95). `plugin` is a new view zone: permissions deny it
  everything, and the navigation guard lets it open no windows or links.

- Plugin RPC (#93): the plugin preload (`src/preload/plugin/`) only forwards
  the one MessagePort main sends on each page load. YapYap's bootstrap,
  served at `/__yapyap/host.js`, builds the SDK's `PluginHost` on it and
  activates the entry. `servePluginRpc` checks each `{ id, method, params }`
  message in ADR 0004's order (envelope and parameter schemas, capability,
  token bucket, timeout) and answers with a result or a typed error.
  `hostMethods` offers `notifications.show` first, which names the plugin
  and respects Do not disturb; the other operations come with their issues.

- Plugin grants (#94): records gain `revoked` and `revokedIn`, which an
  update keeps. `holds` decides each call against them, with account
  capabilities checked for the account on screen, and `grantedHosts` drops
  revoked hosts from the network policy. `plugins:set-grant` changes one
  grant (`withGrant` never gives more than was approved) and the runtime
  rereads it at once; the Plugins window lists every grant with switches,
  per account where it applies. A test fails if YapYap's code ever opens a
  local port or socket.

- Plugin network allowlist (#95): `hostPolicy` decides every request on a
  plugin's session: its own files and plain HTTPS to approved hosts pass;
  a new host the manifest schema would accept asks the user
  (`askHost`, Deny by default, one host at a time), an allowed one joins
  the plugin's record and a refused one is not asked about again until
  restart; everything else is cancelled. The plugin CSP gains
  `connect-src https:` so those requests reach the filter.

- Plugin secrets (#96): `secrets.get`, `secrets.set` and `secrets.delete`
  behind `secrets:own`, kept with `safeStorage` in `plugins/.secrets.json`,
  apart from YapYap's own secrets. Each key is the calling plugin's ID, which
  comes from YapYap, plus a plain name, so one plugin can never name
  another's. Where the system cannot encrypt, the call fails rather than
  keeping the secret in the clear.

- Plugin resource limits (#97): `guardPluginResources` samples each
  plugin's renderer every 5 s through `app.getAppMetrics()`; more than 50%
  CPU or 256 MB in 3 samples in a row restarts the plugin, and a third
  restart within 10 minutes stops it (until YapYap restarts or the plugin is
  installed again) with a system notification. The runtime lists its
  plugins' processes and can stop one.

- Plugin commands (#98, first part): the runtime keeps each running
  plugin's declared commands and the port its page holds, and runs a
  command by sending `{ command }` there; the bootstrap hands it to the
  handler from `commands.onRun`. The menu lists the commands under Plugin
  Commands, named after each plugin, and is rebuilt whenever plugins start
  or stop. Context menu items, composer actions, the settings form and
  panels follow.

- Plugin settings (#98, second part): `formOf` accepts only a plain object
  of string, number, integer and boolean fields (titles, descriptions,
  choices, bounds) from `contributes.settings`; the Plugins window renders
  it, `plugins:set-setting` saves a value only if it fits, records keep the
  values across updates, and the SDK's new `settings.get` (no capability)
  returns those that still fit.

- Plugin menu items (#98, third part): a right click in WhatsApp adds the
  running plugins' composer actions (in the message box) and context-menu
  items (on a message, or on a chat in the list) to YapYap's native menu,
  named `<plugin>: <title>`, after YapYap's own items. The adapter's
  `clickTarget` probe says only which landmark holds the point, scaled for
  zoom, and runs only when some plugin has items. Items naming a command
  the plugin does not declare are dropped. The context menu is now built
  asynchronously.

- Plugin panels (#98, last part): **Plugin Commands** lists each running
  plugin's panel. It opens in a window of its own (`createPanel`), on the
  plugin's session with no preload, titled `<plugin>: <title>` by YapYap,
  which the page cannot change. YapYap serves `/__yapyap/panel.html` to load
  the panel's module. A panel comes forward when opened again and closes
  with its plugin. ADR 0008 C25 explains why a window and not a frame
  beside WhatsApp.

- Plugin activity log (#99): `servePluginRpc` reports each call to an
  operation YapYap offers (operation, capability, outcome) and
  `createAuditLog` appends it, with the time and plugin ID, to
  `plugins/audit.log`, rotating it past 256 KiB. Parameters, results and
  names a plugin makes up are never recorded. The Plugins window lists the
  latest 50 calls under Recent activity.

- Plugin drafts (#100, first part): `composer.insertDraft`, behind
  `composer:insert-draft`, focuses the active account's open chat's message
  box with the adapter's `FOCUS_COMPOSER` probe and types the text there
  with `insertText`, as a notification reply does; it fails when no chat is
  open, and nothing sends. Reading chats follows once the adapter can read
  messages as plain data.

- Plugin chat reading (#100, second part): `chat.readActive`, behind
  `chat:read-active` for the account on screen, runs the adapter's
  `readActiveChat` reader (landmarks v3: `chatName`, `message`,
  `messageText`) and returns the open chat's name, whether it is a group
  (a `@g.us` message ID) and its last messages' text, oldest first, outgoing
  ones marked. The new `plugins.chatMessages` setting (5, 10, 20 or 50,
  default 20; settings v14) caps how many, and the main process checks the
  result before the plugin sees it. Nothing logs it (ADR 0008, C26). The
  unread summary is still to come.

- Extension unread summary (#100, last part): `chat.readUnreadSummary`,
  behind `chat:read-unread-summary` for the account on screen, runs the
  adapter's `readUnreadSummary` reader (landmarks v8: `chatRow`,
  `unreadCount`, `chatTitle`, `chatPreview`, `chatTimestamp`). It reads the
  chat list alone, never opening a chat, which would mark it read and send
  read receipts. For each row with a badge of digits it returns the name,
  the count and the last message's preview as one message, top of the list
  first by position on screen, since the virtualized list reorders its
  rows. At most 20 chats, names of 256 characters and previews of 1,024;
  the main process checks the result against a schema, and nothing logs it
  (ADR 0008, C39). The fake page's chat list now has WhatsApp's row markup
  and one unread chat.

- Example plugin and author guide (#101): `plugins/example` is Greeter, a
  third-party plugin that drafts a greeting the user sets in its settings
  form when they run its command. `tsc` builds it into `dist/` with its
  manifest; `e2e/example-plugin.spec.ts` signs that build with an in-memory
  key, installs it and checks the draft. `yapyap-plugin-sign pack` turns a
  signed folder into an installable archive, refusing one whose signature
  does not verify. The docs site has the author guide at `/plugins/` and an
  SDK API reference at `/api/`, which typedoc generates on every docs build.
  The key-value storage API was never served; #301 tracks it.

- Malicious-plugin suite (#102): `e2e/malicious-plugin.spec.ts` installs a
  hostile plugin next to a victim. It cannot reach WhatsApp's page or
  origin, an undeclared host over `fetch` or WebSocket, the victim's
  secrets or local storage, a send operation (through the SDK or YapYap's
  port), a window of its own, or more calls than its rate allows. A plugin
  that keeps a core busy is restarted. The shared install helpers moved to
  `e2e/plugin-helpers.ts`. The suite found that Electron spreads CPU usage
  over every core, which #97's guard now accounts for.

- AI providers (#103, first part): `plugins/ai-assistant/src/providers/`
  defines one `Provider` interface (stream text, cancel through an
  `AbortSignal`, fail with a `ProviderError` whose kind, never the provider's
  own words, says why) and the Anthropic provider on the official SDK. It
  defaults to `claude-opus-5-5`, asks models that support it for
  server-side refusal fallbacks, retries twice, times out after a minute,
  and maps the SDK's typed errors to auth, rate-limited, network, timeout,
  refused, bad-request, cancelled or failed. Tests stream through a fake
  `fetch`; nothing reaches the network. The OpenAI provider uses the
  official `openai` SDK's chat completions, for OpenAI or, with a base URL,
  any compatible server (which gets the older `max_tokens` limit); a
  `content_filter` finish fails as refused. Both map errors through one
  `kindOf`, as both SDKs share their error classes.

- AI assistant shell (#103, third part): Vite bundles the plugin into
  `main.js` (the hidden page) and `panel.js` (the panel) beside
  `public/manifest.json`. The settings form picks the provider (anthropic,
  openai or compatible), the model and a compatible server's `https://`
  address. The panel takes the API key and sends it over a
  `BroadcastChannel` to the hidden page, which keeps it with
  `secrets.set` under `apiKey.<provider>` and only ever reports whether one
  is there. `e2e/ai-assistant.spec.ts` installs the built bundle and saves
  and forgets a key through the panel. `pnpm test:e2e` builds every plugin
  first.

- Local servers for plugins (#103, part): the `local-network` capability
  lets a plugin reach servers on this computer (`localhost`, `127.0.0.1`,
  `[::1]`, any port, HTTP or HTTPS, no credentials) and nothing else on
  the local network; the plugin CSP lets loopback HTTP reach the network
  filter, which allows it only with the grant (ADR 0008, C29).

- Assistant local-only mode (#103, last part): the AI assistant asks for
  `local-network` and takes a compatible server on this computer
  (`http://localhost:…`, `127.0.0.1` or `[::1]`), which needs no key. Its
  **Local-only mode** setting refuses anything else, and the panel says
  so. The user guide explains running a model on one's own computer.

- Suggested replies with consent (#104, #107): the assistant's panel
  offers **Look at this chat**. Nothing of a chat goes anywhere until the
  user allows the assistant in it (allowed chats are kept by SHA-256
  fingerprint in `storage:local`, never by name, at most 500). The panel
  then shows exactly what would be sent: the instructions and the last
  messages, as many as the new **Messages to send** setting (5, 10 or 20)
  and YapYap's own limit allow. **Send** sends that text, kept by the hidden
  page rather than taken back from the panel; the answer streams in, can be
  stopped, and becomes up to three replies, and the one the user picks goes
  into the message box as a draft. Panel requests run one at a time, in
  order, except Stop. `e2e/ai-assistant.spec.ts` plays Claude with a
  handler on the plugin's session and walks the whole flow. The user guide's
  **AI assistant** page (`/guide/ai-assistant`) walks users through the
  provider, the key and the flow.

- Draft reading and replacing (#105, first part): a new capability,
  `composer:read-draft`, granted per account, lets a plugin read what the
  user typed in the open chat's composer (`composer.readDraft`, through the
  adapter's `readComposer`, at most 64 KiB). `composer.replaceDraft`, under
  `composer:insert-draft`, selects the composer's text and types over it.
  ADR 0008 C28 explains the separate grant.

- Draft rewriting (#105, last part): the assistant's panel gains **Rewrite
  my draft**: a style (friendlier, more formal, shorter, or a translation
  into a named language), then the same consent and exact preview as
  replies, now showing the instructions and the draft read with
  `composer.readDraft`. The rewrite replaces the draft through
  `composer.replaceDraft`; the flow keeps a plan (replies or rewrite) that
  decides what is sent and whether the pick is added or replaces. The
  manifest asks for `composer:read-draft`.

- Chat summaries (#106, first part): **Summarize this chat** in the
  assistant's panel sends the open chat's latest messages, with the same
  consent and exact preview, and shows the summary in the panel only,
  never in the message box. Summarizing exactly the unread messages waits
  for an unread reader (#100).

- Unread catch-up (#106, last part): **Catch up on unread chats** in the
  assistant's panel reads `chat.readUnreadSummary` (the manifest now asks for
  `chat:read-unread-summary`), so no chat is opened or marked read, and
  previews exactly what would be sent: each unread chat's name, count and
  latest message, under instructions to summarize what is waiting. The panel
  says that the chat list holds only each chat's latest message and that the
  preview includes chats where the assistant is off; **Send** sends that text
  once and allows no chat (ADR 0008, C41). The summary shows in the panel
  only. No unread chat, a refused grant and provider errors each have their
  own words. `e2e/ai-assistant.spec.ts` catches up on the fake page's unread
  chat and checks that the open chat and its badge stay as they were.

- Account budgets (#109, first part): `bench/accounts.spec.ts` measures the
  memory a second account adds and the CPU a hidden account uses while
  idle, from cumulative CPU time, and the nightly run holds them to budgets
  per OS (ADR 0009): about 200 MB per account and under 0.5% of a core
  hidden, against budgets of 230–270 MB and 2%.

- Active-use budgets (#109): `bench/activity.spec.ts` runs fifteen rounds
  of use on two accounts (switching between them, a notification from
  each, opening and closing Settings) and measures what memory grows by
  once settled, and the main process's CPU while the rounds run. Growth
  levels off: 45 rounds add no more than 15, so nothing leaks per round.
  CI measured 17–20 MB and 44–48% of a core on all three systems, against
  budgets of 40 MB and 70% (ADR 0009).

- Accessibility checks (#110, first part): `e2e/accessibility.spec.ts` runs
  axe-core against WCAG 2.2 AA on every chrome page the menu opens, in the
  light and dark themes, and a planted unlabelled button proves the check
  bites. axe is evaluated over the DevTools protocol, since Electron cannot
  open the extra page `@axe-core/playwright` needs, and that keeps the
  pages' CSP as it is. No page had a violation. The manual screen reader
  and keyboard checklist for releases is at `/architecture/accessibility`.

- Keyboard checks (#110, second part): the same spec tabs round every
  chrome page that opens from the menu and fails when a control is never
  reached, counting a radio group as one stop, or shows nothing when it has
  focus. All nine pages passed as they were; a planted button with its focus
  hidden proves the check bites. Screen reader checks stay manual.

- Translations design (#111, first part): ADR 0012 settles JSON catalogs in
  the i18next v4 format Weblate edits, generated types so call sites keep
  their shape, per-key English fallback, a Language setting that follows
  the system and switches live, logical CSS for right-to-left, and CI
  checks on every catalog. The maintainer chose pull requests before
  hosted Weblate, and English plus two test pseudo-locales (longer
  accented text, and right-to-left) until a native speaker can review a
  real language.

- Translation catalogs (#111, second part): UI text moved from `en.ts` to
  `locales/en.json`, in i18next JSON v4. `buildCatalog` shapes any catalog
  like English, falling back to English per key. Messages with
  placeholders become functions of named values, and plurals go through
  `Intl.PluralRules`. `scripts/src/bin/i18n-types.ts` generates the
  `Messages` type, and `check-catalogs.ts`, run by `pnpm lint`, rejects
  invalid catalogs and a stale type. Text that English used to build in
  code (badges, default account names, device lists, the import warning)
  is now composed by its caller. `docs/translations.md` documents the
  workflow.

- Right-to-left styles (#111, first part): YapYap's own windows use logical
  CSS properties only (`margin-inline-start`, `text-align: start`,
  `inset-inline-end` and so on), so they mirror for right-to-left
  languages. `scripts/src/bin/check-logical-css.ts`, part of `pnpm lint`,
  rejects a physical left or right in the renderer's stylesheets.

- Security review (#112): `/architecture/security-review` checks YapYap
  against Electron's 20-item security checklist and the plugin threat
  model, naming the code and tests behind each answer. It found two
  things to fix, both fixed here: the screen-share "ended" message now
  checks its sender like "started", and the plugin CSP adds `base-uri`,
  `form-action` and `frame-ancestors 'none'`. Three findings are accepted
  with their reasons (ADR 0008 C2 and C14, and drafts a plugin may
  replace).

- Crash fingerprints and traces (#113): each crash report starts with a
  12-character fingerprint, a hash of the previous session's last five
  warnings and errors without their times and with numbers made alike, and
  the prefilled issue's title names it, so reports of one crash can be
  found together. At every start, YapYap forgets a crash report older than
  30 days and removes any `.dmp` memory dumps under Chromium's crash dumps
  folder. **Help → Record a Performance Trace…** (`recordTrace`) asks
  first, then where to save, records 10 seconds of Chromium tracing in
  timing categories only (no memory dumps or screenshots), and saves a
  Perfetto trace there; nothing is sent.

- User guide FAQ (#114): `docs/guide/faq.md` answers whether YapYap can
  get an account banned (it is WhatsApp Web used by hand, with no
  automation), why calls or locked chats may be missing (WhatsApp decides
  what linked devices get), how many accounts fit, and what to try first
  when something breaks. The guide already covered installing, accounts,
  notifications, theming, shortcuts, recovery and troubleshooting.

- Privacy page inventory (#115): `docs/privacy.md` lists every file and
  folder in the profile, what each holds and how to delete it, for
  WhatsApp's data, YapYap's own and plugins'. The reference guide links to
  it instead of keeping a shorter copy.

- Architecture overview (#116): `docs/architecture/index.md` draws the
  processes and trust zones and the checks on a plugin call as inline SVG
  in the theme's colors, so both follow light and dark mode and need no
  diagram library. It walks through a notification, a plugin call and an
  AI assistant reply, and indexes the ADRs by topic.

- README polish (#117): the README shows the main window, links the
  get-started guide, and its highlights cover the assistant bar, the
  marketplace and call recording. Store screenshots came in #435.

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

- Beta gate without a wait (#184): the maintainer chose to decide how long
  each beta stays out, so the gate now only requires a published beta of
  the release's version, and the `Security release:` exception, which only
  skipped the wait, is gone.

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

- Start at login in Flatpak (#234): inside the sandbox, YapYap asks the
  Background portal over the session bus (a small D-Bus client in
  `src/main/autostart/`, tested against an in-memory fake bus), and the
  setting changes only when the portal grants it. Setting effects may now
  wait. Connecting to the bus is the one client use of `node:net` the
  no-endpoint test allows (C33 in ADR 0008).

- Proxy sign-in test on Windows (#247): the test gave the sign-in window
  Playwright's default 5 s, which has to cover the app's launch and the
  proxy's first refusal; slow Windows runners went past it twice. It now
  waits 20 s, like the other waits that start at launch.

- Windows E2E start-up timeouts (#247, diagnostics): a failed E2E test
  attaches the app's last log lines to its report, and `whatsAppPage` names
  the pages that did exist when the account view never appeared, so the
  next slow start on a Windows runner shows whether the view was created
  late or loaded late.

- Windows E2E start-up timeouts (#247, load timeline): a normal start logs
  nothing, so the attached log stayed empty when it happened again. Each
  test now records, from the main process, when every web contents is
  created and starts, finishes or fails a load, crashes or hangs, and a
  failed test attaches that timeline (`loads.txt`) with each web contents'
  state at the end.

- Windows start-up waits (#247): when no WhatsApp page appears in time, the
  E2E failure now says how long ago the app was launched, whether Electron
  was ready, how many windows existed and what each web contents showed, so
  a slow start on a runner can be told from a page that never loads. The
  wait itself is unchanged until that data says which it is.

- Second account waits (#247): the specs that add an account wait for its
  page through `whatsAppPage(app, first)`, with the same 30 s and startup
  diagnostics as the first account's, instead of `expect.poll`'s 5 s, which
  a slow Windows runner overran.

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

- Electron 45.0.0 (#277; Chromium 156, Node 24.22). Screen capture now
  reaches the permission handler as `display-capture`, which goes to the
  same source picker as the legacy empty `media` request; both still need
  the user's pick. The secret store uses `safeStorage`'s asynchronous
  methods, as the synchronous ones go away in Electron 46, and stores a
  secret again when the system rotates its key. Both preloads still require
  nothing but `electron`, as sandboxed preloads lose `Buffer` and timers.

- Call window test (#296): Hang up closes its own window, which could end
  Playwright's click before it saw it finish ("Target page, context or
  browser has been closed"), on any system. The test now waits for the
  window to close, as the plugin consent helper does for Install.

- Plugin storage (#301): `storage.get`, `storage.set` and `storage.delete`,
  behind `storage:local`, keep JSON values in the calling plugin's own file
  under `plugins/.storage/` (`keyValueStore`), up to 1 MiB per plugin and
  readable by the user alone. The audit log records the calls, never keys
  or values.

- Nightly mutation shards (#312): the full mutation run had timed out at two
  hours every night since 2026-10-21. It now runs as 16 shards, each
  mutating a sixteenth of the in-scope modules
  (`mutation-targets.ts --shard i/16`) and running only their related
  tests, as pull requests do. The first sharded run found surviving mutants
  the timed-out runs had never reported, in `audit-log.ts` (74.6%) and
  `shortcut-settings.ts`; new tests kill them, and the remaining survivors
  are equivalent.

- Busy-plugin restart test (#327): the test waited for the spinner's
  renderer to differ from the first, which the moment with none between
  the two also did; it now waits for a new renderer that exists.

- Replacing the draft (#330): `composer.replaceDraft` focused the message
  box from the adapter, then selected all with a separate input event,
  which sometimes landed before focus and selected nothing, so the new text
  followed the old. The adapter's `selectComposer` now focuses the box and
  selects its contents in one script, before anything is typed.

- Removing plugins (#332): the Plugins window has **Remove…** for each
  plugin. Once the user confirms in a dialog that defaults to Cancel, YapYap
  stops the plugin, clears its sessions, deletes its record, files,
  key-value store and secrets, and keeps its audit entries. Proxy login and
  startup now take only the secret operations they use.
  The plugin guide tells authors that removal deletes what a plugin kept,
  and that `local-network` lets `fetch` reach this computer.

- Plugins window refresh (#342): the window listed the plugins once, when
  it opened, so a plugin installed, removed or stopped while it was open
  did not show, and a slow runner could open it between the consent window
  closing and the install saving its record. The main process now sends
  `plugins:changed` to an open Plugins window whenever a plugin starts or
  stops (`createChromeWindowSlot`), and the window lists them again.

- apt and dnf repositories (#344): `packages.guita.org`, a Cloudflare Pages
  project, serves signed stable and beta indexes and redirects every package
  path to GitHub Releases. `package-repository.ts` plans each channel from
  the published releases (betas and releases in beta, releases alone in
  stable, five each), `index.sh` builds and signs the indexes, and the
  release and beta workflows deploy them once the signing key and Cloudflare
  token exist. `test.sh` builds stand-in packages and checks install,
  update, channel separation and tampering on Debian 13, Ubuntu 24.04 and
  26.04, and Fedora 44. The repo file sets `skip_if_unavailable=0`, since
  Fedora otherwise skips a repository whose signature fails without a word.
  The first deploy failed on an escaped line break in the workflow, a path
  the test did not run; `build-site.sh` now builds and signs the site in a
  container for both, so the test covers the deploy's own commands. Both
  prefer docker: runners also have podman, which cannot read the key folder
  docker's import leaves. Under docker, `build-site.sh` hands the site back
  to the caller once it is signed. Wrangler is installed into a folder of
  its own without install scripts, since Cloudflare's action installs it
  with pnpm, which the job does not set up.

- Total downloads (#347): the docs build, now also daily, sums GitHub's
  download counts of every release's installers and packages
  (`downloads.ts`; update metadata, checksums and signatures do not count,
  since the updater reads some on every check) into `downloads.json`, which
  the home page shows from the site itself, and `downloads-badge.json`,
  which the README's Shields.io badge reads.

- pacman repository (#350): releases and betas also build `yapyap-bin` as a
  pacman package from their `.deb` (betas as `0.1.0beta.1`, which pacman
  sorts before `0.1.0`), and `packages.guita.org/arch/<channel>/x86_64`
  serves its signed database and package signatures, redirecting each
  package to GitHub with a rule of its own. `index-pacman.sh` builds it on
  Arch Linux with `repo-add --prevent-downgrade`, since repo-add otherwise
  lets an older package added later replace the newest. The pacman.conf
  section requires signatures on the database too, and `test.sh` covers
  Arch clients on both channels and a tampered database. The deploy's own
  check asks pacman for the package alone (`-Sddp`); without `-dd` it also
  lists every dependency's file, which failed the first release's check.

- One changelog entry per change (#358): release-please listed most
  changes twice, for the commit and for the merge commit, whose subject is
  the PR's Conventional Commit title (ADR 0007). After it updates the
  release PR, the release workflow runs `merge-changelog.ts`, which merges
  each pair into one entry with the PR link and every closed issue, commits
  CHANGELOG.md through the GraphQL API so GitHub signs it, and fixes the PR
  body the release notes come from. It finds the open release PR itself,
  since release-please reports one only when a push changed it, and talks
  to GitHub through GraphQL alone, so no value it reads ends up in a URL.

- Login entry ownership (#362): at start, YapYap re-points an existing
  Linux autostart entry only when the program it names is gone, as after an
  AppImage moved, so another YapYap build started once, even with its own
  profile, no longer takes over the user's "Start at login". Login items on
  Windows and macOS keep refreshing as before.

- Calls asking for the microphone and camera (#363): v0.1.0 users could not
  call. Electron reports a refused permission check as `denied`, and the
  check handler refused every WhatsApp check: it compared Electron's origin,
  which ends in a slash, with the account's home as text. Even matched, it
  refused devices not yet allowed. WhatsApp checks before a call and, seeing
  `denied`, never asked. Checks now compare origins with `isSameOrigin` and
  answer yes for `media`, whose request still asks the user (ADR 0008,
  C30), and an E2E test queries the permissions as WhatsApp does first.

- No dots in catalog keys (#374): `settings.fields` is nested by settings
  section, so no key holds a `.`, which tools that flatten i18next JSON
  read as nesting. `check-catalogs.ts` refuses a dotted key. The catalog
  round-trips unchanged through translate-toolkit's i18next v4 format,
  which Weblate uses; so did the dotted one, so this guards other tools
  and keeps keys simple rather than fixing a breakage seen in Weblate.

- Drafts take the keyboard first (#376): inserting an extension's or a
  notification's draft now focuses WhatsApp's view before typing, since
  typed text goes to the page holding the keyboard, which another YapYap
  window may hold. Likely cause of the macOS example-extension flake.

- Memory watchdog after an account's page goes away (#377): `watchMemory`
  sampled each account's renderer every minute with no end, so after the
  page was destroyed, as when its account is removed, every sample threw
  "Object has been destroyed" into the log. It now stops its timer on the
  renderer's `destroyed` event.

- GPU crash fallback (#379): one GPU process failure, during a quit or an
  upgrade, fired `child-process-gone` five times within 6 ms, which counted
  as five crashes and turned hardware acceleration off for a day. A run now
  records at most one crash, nothing after `before-quit`, and logs the
  reason and exit code.

- Account photo retries (#381): the first photo read often came before
  WhatsApp showed the photo, and the next one waited for a page title
  change, so the sidebar could show the initial for hours. After a miss,
  `accountAvatars` now reads again a minute later on its own, up to ten
  misses in a row, and stops for a removed account or a destroyed page.

- User-first website (#383, #384): the home page leads with "WhatsApp,
  supercharged.", a download button that picks the visitor's installer from
  `latest.json` (written by the daily docs build with the download counts),
  the AI assistant, accounts, plugins and privacy, and a comparison with the
  official app on verifiable points. Screenshots of YapYap's own windows come
  from `pnpm screenshots` on a showcase page; the main window's show the real
  WhatsApp with every name, photo and message replaced on screen. The
  navigation puts Download, Guide and the assistant first, and developer
  pages under one menu; the install page opens with the button and the
  apt, dnf and pacman commands as tabs.

- Store screenshots (#384): the AppStream metainfo lists the website's
  screenshots with captions, so software centers and Flathub show them. The
  Marketplace shot waits for the marketplace to list the assistant again.

- Get started (#385): a six-step guide at `/guide/get-started`, linked from
  the home page, the guide's sidebar and the welcome window, with new
  Accounts and Marketplace screenshots from the showcase page and a local
  signed marketplace. The Marketplace tab's permission list was laid out as
  centered rows by the global list style; it is a bulleted list now.

- Plugin marketplace design (#386): ADR 0014. One `index.json` on
  packages.guita.org, signed with the plugin signing key and checked against
  the app's trust anchors, with a growing serial and an expiry so old
  copies are refused; archives hosted with YapYap's releases and checked by
  SHA-256; reviewed third-party plugins pinned to the key the index lists;
  revocations that stop matching copies without deleting them;
  `yapyap://plugins/install/<id>` links that only open the marketplace; and
  submissions through pull requests.

- Marketplace index (#387): `marketplace/plugins/<id>.json` lists each
  plugin's versions by release asset and SHA-256, and
  `scripts/src/bin/marketplace-index.ts` checks every archive's hash,
  signature, signer and manifest before building `plugins/index.json`. The
  package repositories workflow signs it with the plugin key and deploys it
  weekly and on changes; CI checks the entries on every pull request. The
  schema is `MarketplaceIndexSchema` in the SDK, and `signIndex` /
  `verifyIndex` in plugin-sign sign the exact bytes. The AI assistant 0.1.0
  from v0.1.2-beta.3 is the first listing.

- Marketplace tab (#388, first part): the Plugins window has **Installed** and
  **Marketplace** tabs. The marketplace downloads the index and its
  signature only when the tab opens, on an in-memory session with no
  cookies, capped at the index's size limit; it uses the index only if a
  trust anchor signed its exact bytes, it matches the schema, has not
  expired and its serial is no lower than the last one accepted (kept in
  `plugins/.marketplace.json`). It lists the newest version this YapYap runs,
  leaving out pulled ones, and installs a listed plugin by ID: the archive
  must match the index's size and SHA-256 and be the listed plugin,
  version and signer, then goes through the usual consent, where reviewed
  plugins (trust `reviewed`) need no acknowledgement. E2E tests use a local
  marketplace through `YAPYAP_TEST_MARKETPLACE_ORIGIN` and
  `YAPYAP_TEST_MARKETPLACE_ANCHOR`, which only unpackaged builds honor.
  When the tab reads a verified index, installed copies a revocation
  matches (same ID, version and signing key) are marked `pulled` in their
  record and stopped; the runtime never starts a pulled plugin, the
  Installed tab shows the reason, and the copy and its data stay until the
  user removes it or installs another version.

- Install links (#389): YapYap registers the `yapyap:` scheme (electron-builder
  `protocols` for Windows and macOS, `x-scheme-handler/yapyap` in the
  desktop entries, also used by Flatpak) and accepts only
  `yapyap://plugins/install/<id>`, with a valid plugin ID and nothing else
  (`navigation/plugin-link.ts`). A link from a later launch, from macOS
  `open-url`, or the one that started YapYap goes to the marketplace
  install, which checks the signed index and asks in the consent window;
  links that arrive while one is handled are ignored, and other links are
  refused without logging them. The website's buttons come with #390.

- Marketplace pages (#390): the docs build downloads the published index and
  its signature, checks them as YapYap does (trust anchor, schema, expiry;
  `scripts/src/marketplace/site.ts`), and generates `/marketplace/` and one
  page per plugin (VitePress dynamic routes): who vouches for it, what it
  asks for in the consent window's words, author, website, license and
  versions, an **Install in YapYap** link (#389), and install steps for
  people without YapYap. An index that cannot be read or verified lists
  nothing. The pages are plain HTML without scripts; they update when the
  docs deploy. Screenshots and changelogs need index fields first.

- Plugin submissions (#391): authors submit through a plugin submission issue
  form (ID, version, source repository and tag, archive URL and SHA-256,
  key fingerprint, homepage, license, why each capability and host, privacy
  policy). The plugin guide gives the review checklist, what "reviewed"
  means and does not, and how to report a misbehaving plugin; CONTRIBUTING
  gives the maintainer's steps and the takedown through `revoked.json`.
  Entries of reviewed plugins must name their `repository` and each
  version's `tag`. Where reviewed archives are hosted is open (#419), as a
  release here could confuse the beta channel's updater.

- Call recording design (#392): ADR 0015 and C32. YapYap records, never a
  plugin: `calls:record` only lets a plugin ask, and recording starts on the
  user's **Record** click in a bar YapYap draws in the call window. A hidden
  recorder captures the call window's own audio (display media with the
  call's frame as the audio source) and the microphone, never system sound,
  after a one-time consent-law confirmation. A red mark with **Stop
  recording** shows in the call window, sidebar and tray; recordings stop
  with the call, stay local, and are named by date only.

- Call recording (#392): `calls:record` and `host.calls`, as ADR 0015 and its
  amendment describe. A hidden recorder page on the chrome session mixes
  the call window's frame audio with the microphone and streams WebM to the
  main process, which writes `YapYap call <date> <time>.webm` to the Music
  folder's `YapYap` folder. The Record prompt is a small window attached to
  the call window. The sidebar and tray marks come next. E2E records the
  fake call's tone with Chromium's fake microphone.

- Call recorder extension (#393): `extensions/call-recorder`, YapYap's own
  extension over `calls:record`, with Record and Stop commands and a panel
  listing the recordings with Show in folder. Format and folder choices
  belong to YapYap, which writes the files, and command shortcuts need a
  host feature; both are follow-ups. Its marketplace entry comes with the
  next beta.

- Local E2E isolation on Wayland desktops (#394): Chromium chose Wayland
  from the desktop's `XDG_SESSION_TYPE` and reached the real compositor
  through its default socket, so local runs opened windows on the
  developer's desktop. `appEnvironment` now sets `XDG_SESSION_TYPE=x11`
  unless a test asks for Wayland.

- Panel style (#396): plugin panels had the browser's default look.
  YapYap now serves `/__yapyap/panel.css`, which every panel page links
  before the plugin's module, under the plugin CSP and unreplaceable by
  plugin files. It brings YapYap's colors in light and dark, styled form
  controls and lists, a focus ring, documented `--yapyap-*` variables and
  a `yapyap-primary` class, which the AI assistant uses for its next step.

- Withdrawing read notifications (#398): WhatsApp leaves its notifications
  in the system's list after their chats are read, and GNOME's dock counts
  them. When an account's title shows no unread chats, YapYap now closes
  that account's notifications.

- Notarizing with an API key (#400): the Apple account YapYap signs with
  cannot make app-specific passwords, so the package workflow now
  notarizes with an App Store Connect API key when `APPLE_API_KEY`,
  `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set. It writes the key to a
  private file in the runner's temporary folder, and falls back to the
  Apple ID secrets otherwise.

- Scorecard (#404): releases carry their Sigstore bundle and in-toto
  provenance (#406), the deploy tool installs from a lockfile, and every job
  asks only for the permissions it uses. CONTRIBUTING explains the checks
  that stay below 10 (Code-Review and Branch-Protection with one
  maintainer, Signed-Releases rising with new releases, Packaging,
  Maintained). The score was 7.2 on 2026-10-27.

- OpenSSF Scorecard (#404): each release now carries its signed build
  provenance as `yapyap-<tag>.sigstore.json` and `yapyap-<tag>.intoto.jsonl`,
  where Scorecard and other verifiers look. The packages.guita.org deploy
  installs wrangler with `npm ci` from `packaging/repository/deploy`, a
  lockfile Dependabot keeps current, and the pinned-versions job proposes
  updates only with the automation App's token, its workflow token
  read-only.

- In-chat assistant design (#407, first part): ADR 0013 puts AI
  suggestions in a bar YapYap draws beneath WhatsApp's view, filled by a
  plugin holding `assistant:bar` with plain text, and acting only on the
  user's clicks: **Suggest replies**, **Write a message**, and a Send button
  that only YapYap's own interface has (C31 in ADR 0008).

- In-chat AI suggestions (#407): an extension holding `assistant:bar` fills a
  bar YapYap draws beneath the open chat with plain-text suggestions, through
  `host.assistant.offer` and `onRequest`. The user asks for replies, or
  types what to say, and puts a suggestion in the message box or sends it
  with a click; YapYap sends with Enter only after checking the chat is
  still the one the suggestion was made for. The AI assistant fills the bar,
  asking in the bar before a chat's messages leave for the first time.

- Chat reader markers (#410): WhatsApp dropped the `true_` prefix that
  marked the account's own messages, so plugins saw every message as
  someone else's. The reader now also knows them by the tail and the
  clickable delivery status only sent messages have, reads the message
  body without the time beside it, and finds the chat's name by its test
  ID (landmarks v5). The fake page follows today's structure. Groups still
  need a new marker.

- Group chats again (#410, last part): today's message IDs no longer name a
  group, so the chat reader knows a group by the sender names WhatsApp shows
  only in groups (`[data-testid="author"]` outside a quoted message), mapped
  in the maintainer's own session (structure only). Landmarks v7 add both,
  and the fake page's one-to-one chat quotes a named message.

- Extensions, not plugins (#426, ADR 0016): YapYap's add-ons are called
  extensions everywhere, with no backward compatibility: new package,
  scheme, archive, folder, link and index names, and the
  `EXTENSION_SIGNING_KEY` secret. Notes above keep the old word. The
  AI assistant's marketplace entry returns with the next beta's
  `.yapyap-extension` archive. TypeBox ignores the limits of a Record's key
  schema, so extension setting names, per-account revocations and custom
  code snippet names now check their keys with `propertyNames`.

- Idle memory by process (#428): the startup benchmark also reports each
  process's memory (main window, WhatsApp, YapYap's own pages, GPU, network
  and so on), so an overrun shows where it went. Windows went over its
  budget because the runners grew, not YapYap: the same code measured 13 MB
  more three days later. The idle-memory budgets are recalibrated 10% above
  today's medians (ADR 0009).

- Local model servers (#430): an extension holding `local-network` now
  needs the user's approval for each server on this computer (host and
  port), asked like a new host and kept in its record (`localServers`).
  Requests to an approved server leave without an `Origin`, and YapYap
  answers CORS for them itself, so Ollama, including Alpaca's, works out of
  the box (ADR 0004, C34 in ADR 0008). The E2E test's server refuses any
  `Origin`, as Ollama does.

- Extension settings that stick (#431): text and number settings in
  Extensions… now save on Enter, on leaving the field, and when the window
  closes, and say "Saved" or why not; before, closing the window right after
  typing lost the edit without a sign.

- Release notes in the marketplace (#434, first part): a listed version may
  carry `notes`, plain text that the signed index keeps, the website shows
  beside each version, and the Marketplace tab shows under **What's new**
  when it offers an update. Screenshots come next.

- Release notes in the marketplace (#434, first part): a listed version may
  carry `notes`, plain text that the signed index keeps, the website shows
  beside each version, and the Marketplace tab shows under **What's new**
  when it offers an update. An entry may also list up to five screenshots,
  committed in `marketplace/screenshots/<id>/`, checked as PNG or WebP of at
  most 1 MiB, served beside the index and shown on the extension's page.

- Recordings folder (#442): Settings → Call recordings → **Save recordings
  to** picks the folder with the system's dialog, like the downloads folder,
  and a folder that is gone means `YapYap` in the Music folder again
  (settings version 15). Folder fields name their own default now, and each
  **Choose…** button is named after its field.

- Recording format (#442): Settings → Call recordings → **Record as** offers
  WAV beside Opus in WebM (settings version 17). The recorder page reads the
  mixed track's frames with `MediaStreamTrackProcessor` and writes 16-bit
  stereo PCM after a header, whose sizes the main process completes when the
  recording ends.

- Extension command shortcuts (#443, first part): a command may suggest
  keys in its manifest (`shortcut`), which the menu gives it only when they
  clash with none of YapYap's shortcuts, as the user set them, nor an earlier
  extension's. Changing or removing them comes next.

- Recorder keys: the call recorder suggests Ctrl+Alt+R to record and
  Ctrl+Alt+S to stop (⌘⌥ on macOS), which the menu gives it as nothing else
  has them (#443).

- Changing extension command keys (#443): the Keyboard Shortcuts window lists
  the running extensions' commands, and the user can give one other keys,
  remove its keys, or reset to the suggestion. Choices live in
  `shortcuts.extensions` (settings version 16), come before suggestions, and
  rebuild the menu.

- Finding a model on this computer (#456): a new host API,
  `host.localModels.find()` behind `local-network`, lets YapYap look for
  model servers on the user's computer for an extension. The first call
  asks the user once (Deny the default), and the answer is kept in the
  record as `modelSearch`; turning `local-network` off or on forgets it.
  The main process then sends `GET /v1/models` to `127.0.0.1` on Ollama's,
  Alpaca's, LM Studio's and llama.cpp's usual ports at once, with Node's
  `fetch`: no redirects or cookies, a 1.5-second timeout, a 256 KiB cap,
  and a check on each of the up to 20 model IDs a server lists; YapYap
  builds the up to four server addresses itself, from real ports only.
  Finding a server approves nothing; the extension's first request still
  asks under #430. That call waits up to two minutes for the answer, so
  RPC methods may now set their own timeout and refuse as `not-granted`.
  The AI assistant offers **Find a model** in the bar and the panel until
  the user chooses a provider, keeps the first server with models in its
  storage, and uses it as a compatible provider; a provider chosen in
  Settings always wins. It explains plainly when nothing is found, when
  the server has no model or stopped answering, and when the user said
  no. E2E tests point the probe at a fake server through
  `YAPYAP_TEST_MODEL_PORTS`, which a packaged build ignores (ADR 0001,
  ADR 0004, C37 in ADR 0008).

- Running a model on the computer (#457, first part): a new capability,
  `local-model`, shown at install as running an AI model on this computer,
  gives an extension what an engine compiled to WebAssembly needs, such as
  wllama for the AI assistant's private model. Only its holders get
  `'wasm-unsafe-eval'`, `worker-src blob:` and `connect-src 'self'` in their
  CSP, cross-origin isolation (COOP and COEP on every response, for
  `SharedArrayBuffer` and threads), no CPU limit, and a memory limit of
  4 GiB or half the computer's memory. The `extension` scheme supports
  `fetch`, and `.wasm` is served as `application/wasm`. Every other
  extension's headers are unchanged, which a test pins. The grant is read
  on every response and sample, so taking it back applies from the next
  load (ADR 0004 amendment, C38 in ADR 0008). The assistant's engine comes
  in the second part.

- Private model in the AI assistant (#457, second part): the assistant runs
  Qwen2.5 1.5B Instruct, or 0.5B under 8 GB of memory or 4 cores, with
  wllama 3.8.1, whose one `.wasm` ships in the signed extension with
  compatibility mode and its CDN turned off. When nothing is set up and
  **Find a model** finds no server, the bar and the panel offer it; the
  download starts only on that click, from Hugging Face, pinned by commit,
  size and SHA-256 and hashed as it streams with `@noble/hashes`. It is
  kept in the extension's origin private file system in 32 MB pieces, so a
  broken or quit download resumes with a `Range` request, and a file that
  does not match is deleted. A new provider, `built-in`, answers when the
  user picks it and chose no other in Settings, through the same `Provider`
  interface, and the bar lists it as **Private model (…)**. The bar and the
  panel show progress, warming up, and plain errors with one-click ways
  out (resume, download again, try the smaller one); the panel shows the
  space it takes and **Remove model**. The bar tries a request up to three
  times, a second apart, while YapYap's own rate refuses it, and drops a
  leading "Me:" a small model copies from the transcript. E2E tests load a 1 MB MIT test model, served
  from a local fake through `YAPYAP_TEST_BUILT_IN_MODEL`, which a packaged
  build ignores, and run it in the real isolated page.

- Start minimized after a maximized session (#458): maximizing or entering
  full screen shows a hidden window, so a window started minimized gets its
  saved layout back only when the tray, the Dock or a second launch first
  shows it.

- Vite advisory and SonarQube cleanup (#461): the docs site's Vite override
  moves to 6.4.5 (GHSA-8g5g-mxqh-grgj), and the open SonarQube issues on
  `master` are fixed. The WAV encoder pipes the track's frames into a sink
  instead of awaiting reads in a loop. The two `charCodeAt` findings in
  `canonical.ts` are false positives: signatures sort keys by UTF-16 code
  unit, which a test now pins with an astral character.

- Assistant bar in the chat (#466): the AI assistant bar now sits inside
  WhatsApp's page, right above the message box, instead of in a view beneath
  WhatsApp, so the conversation moves up to make room. The adapter renders it
  in its isolated world, in a closed shadow root, writing extension text only
  as text; its buttons act only on trusted events, and the WhatsApp preload
  gives the bar's five actions to that world alone. The main process hears
  them only from the active account's page, and puts the bar back about once
  a second while it shows, since WhatsApp drops it when it redraws a chat and
  the adapter adds no observers. Landmarks v6 add the message box's footer
  (ADR 0013 amendment, C35 in ADR 0008). The bar shows as soon as its
  extension runs, so a request made before the extension's page has its
  port, or before the page listens, waits for it instead of being lost.
  (ADR 0013 amendment, C35 in ADR 0008).

- Model choice and Auto (#467, #463): the assistant bar shows the model
  that answers and lists every model the provider offers, with **Auto**
  first. Auto picks the newest of Claude's Haiku models, OpenAI's newest
  mini chat model, or a local server's smallest installed model (sizes
  from Ollama's `/api/tags`), so no model is hard-coded. The Model setting
  is gone: a pick in the bar reaches the extension as a `choose` request,
  only for an offered option, and the extension keeps it in its storage,
  falling back to Auto once the provider stops listing it. Lists are kept
  ten minutes per provider and key. Extension RPC's burst grows from 20 to
  40 calls, at the same 5 a second, since the assistant's panel and bar
  share it (C36 in ADR 0008).

- Suggestions as messages arrive (#468): when a message arrives in the open
  chat, the assistant bar asks for suggestions on its own, while YapYap's
  window is in front and the bar is not already waiting. The main process
  looks about every 1.5 seconds with an adapter probe that returns only
  hashes of the chat and of its newest incoming message, computed in the
  page from the message ID, and asks only when the message changes in the
  same chat. **Settings → Extensions → Suggest replies automatically** (on
  by default, settings version 18) turns it off. ADR 0013 is amended.

- Extensions released on their own (#474): the AI assistant and the call
  recorder stay in this repository but get their own release-please
  components, changelogs and `<name>-vX.Y.Z` tags, with `feat` raising the
  minor version. Releasing one builds and signs it alone, attaches it to
  its release, and opens a marketplace PR adding the version
  (`scripts/src/bin/marketplace-release.ts`), with `minYapYap` from its
  `package.json`. App releases no longer carry the extensions. The
  assistant's first release of its own will be 0.2.0, needing YapYap 0.2.1.

- Extension release PRs (#478): release-please writes extension manifests in
  its own format, so Prettier leaves `extensions/*/public/manifest.json`
  alone, and the changelog cleanup (#358) now runs on every release PR,
  YapYap's and each extension's, with that track's own changelog. Lint and
  git ignore `.claude/`, where coding agents keep their worktrees.

- Assistant bar on real WhatsApp (#482): WhatsApp orders the open chat with
  flexbox `order` and covers it with a positioned wallpaper, so the bar sat
  at the top and under the wallpaper, where no click reached it. The bar now
  takes the message box's `order` and stacking on every render, and the
  fake WhatsApp page has the same layout, so E2E tests catch it.

- Saving the assistant's key reliably (#484): the panel sends **Save key**
  or **Forget key** again until the hidden page's reply names that request,
  since the channel keeps nothing for a page that is reloading. This was
  the cause of the panel E2E tests that failed under load.

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
