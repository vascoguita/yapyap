# YapYap: agent and contributor guide

YapYap is an MIT-licensed, unofficial desktop client for WhatsApp Web on Linux,
Windows and macOS. It wraps `https://web.whatsapp.com` in a hardened Electron
shell, so WhatsApp runs on the stock Chromium it is built for. It adds isolated
multi-account sessions, native notifications, a tray, and recovery tools. It
also hosts a sandboxed, signed plugin system, which ships with a
bring-your-own-model AI writing assistant. It has no telemetry, and it is not
affiliated with WhatsApp or Meta.

Start every session by reading this file, `docs/progress.md`, and the ADRs
under `docs/adr/`.

## Commands

Use pnpm (version pinned in `package.json`) on Node.js 24 LTS.

| Task                            | Command                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Install                         | `pnpm install` (CI: `pnpm install --frozen-lockfile`)                                    |
| Run the app (hot reload)        | `pnpm dev`                                                                               |
| Build all packages              | `pnpm build`                                                                             |
| Lint (ESLint + Prettier + knip) | `pnpm lint`                                                                              |
| Format                          | `pnpm format`                                                                            |
| Typecheck                       | `pnpm typecheck`                                                                         |
| Unit + integration tests        | `pnpm test`                                                                              |
| Coverage (100% gate)            | `pnpm test:coverage`                                                                     |
| E2E tests                       | `dbus-run-session -- xvfb-run -a pnpm test:e2e` on Linux, else `pnpm test:e2e`           |
| Mutation tests (≥ 90%)          | `pnpm test:mutation` (PR CI mutates changed in-scope files only)                         |
| Performance benchmark           | `xvfb-run -a pnpm test:bench` (nightly; budgets in `apps/desktop/e2e/bench/`, ADR 0009)  |
| Commit messages                 | `pnpm commitlint`                                                                        |
| License compatibility           | `pnpm check:licenses`                                                                    |
| Vulnerability audit             | `pnpm audit --audit-level high`                                                          |
| Docs site (dev / build)         | `pnpm docs:dev` / `pnpm docs:build`                                                      |
| Package installers for this OS  | `pnpm package` (output in `apps/desktop/release/`)                                       |
| Smoke-test an installed package | `YAPYAP_PACKAGED_EXECUTABLE=<path> pnpm test:smoke`                                      |
| Verify hardened fuses           | `node scripts/src/bin/verify-fuses.ts <executable or .app>`                              |
| AUR PKGBUILD and .SRCINFO       | `node scripts/src/bin/aur.ts <version> <amd64 .deb> <arm64 .deb> <output dir>`           |
| Sign or verify a plugin folder  | `node packages/plugin-sign/src/bin/yapyap-plugin-sign.ts sign --key <pem> <folder>`      |
| Flatpak bundle (Linux)          | See the `flatpak` job in `.github/workflows/package.yml`; it runs in Flathub's container |

Update this table in the PR that adds a command.

## Architecture map

| Part             | Path                                              | Notes                                                                                   |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Main process     | `apps/desktop/src/main/`                          | App lifecycle, windows, IPC validation, settings, updates                               |
| Preloads         | `apps/desktop/src/preload/`                       | Minimal typed `contextBridge` APIs, one per zone                                        |
| Chrome renderer  | `apps/desktop/src/renderer/`                      | YapYap's own UI (Preact), served from `app://`                                          |
| WhatsApp adapter | `apps/desktop/src/adapter/`                       | **The only place** with WhatsApp DOM knowledge; versioned selectors; returns plain data |
| Plugin host      | `apps/desktop/src/main/plugins/`                  | Sandboxed plugin renderers, RPC, capabilities, signatures                               |
| Plugin SDK       | `packages/sdk/`                                   | Typed plugin API and manifest JSON Schema (TSDoc on every export)                       |
| Signing CLI      | `packages/plugin-sign/`                           | Ed25519 signing and verification (PKCS#8 PEM keys)                                      |
| Plugins          | `plugins/ai-assistant/`, `plugins/example/`       | First-party plugins                                                                     |
| Docs             | `docs/`                                           | VitePress site, ADRs in `docs/adr/`                                                     |
| Repo automation  | `scripts/`                                        | Tested automation such as pinned-version checks; entries in `scripts/src/bin/`          |
| Packaging        | `apps/desktop/electron-builder.yml`, `packaging/` | electron-builder targets, fuses, desktop entry, AppStream metainfo                      |
| Release pipeline | `.github/workflows/{package,smoke,release}.yml`   | CI and releases share packaging and smoke tests; releases add signing, SBOM, provenance |

## Non-negotiable rules

1. **Priority order.** When rules conflict: security > correctness > user
   privacy > confidentiality > tests and coverage > performance > code style.
   Log every conflict in `docs/adr/0008-requirement-conflicts.md`.
2. **Confidentiality.** Never mention or link to the reference project in any
   committed or public artifact. That includes code, comments, tests,
   fixtures, docs, commit messages, branch names, issues, PRs and release
   notes. Describe feature choices as based on "common needs of WhatsApp Web
   desktop users".
3. **Never automate a real WhatsApp account.** Tests use the local fake
   WhatsApp page and anonymized fixtures only.
4. **Comments explain why, never what.** Good reasons are constraints,
   WhatsApp quirks, security reasoning, and workarounds (with a link to the
   YapYap issue). No commented-out code, and no TODOs: open an issue. Every
   exported SDK symbol has TSDoc.
5. **Coverage.** 100% lines and branches. `istanbul`, `c8` and `v8` ignore
   comments are forbidden (enforced by lint). Coverage exclusions live only in
   `vitest.config.ts` and must be justified in ADR 0005.
6. **Lint.** `strict-type-checked` + `stylistic-type-checked`, complexity ≤ 8,
   functions ≤ 40 lines, no `any`, no non-null assertions, no unused exports
   (knip).
7. **Security settings.** All web content runs with `sandbox: true`,
   `contextIsolation: true`, `nodeIntegration: false` and no `webviewTag`.
   Other requirements: strict CSP for app UI, minimal typed preloads, sender
   and payload validation on every IPC call, deny-by-default permissions,
   navigation and `window.open` guards, hardened fuses. No remote code except
   WhatsApp itself and signed user-installed plugins. See ADR 0001.
8. **Plugin trust model.** Plugins are Ed25519-signed. They run in their own
   sandboxed renderer and partition, talk to the host over one MessagePort
   with schema-validated, capability-checked, rate-limited RPC, and never
   touch the WhatsApp DOM. There is no send-message API: plugins insert
   drafts only. See ADR 0004.
9. **Privacy.** No telemetry. Never log or persist message content, phone
   numbers or secrets. Secrets go through `safeStorage`.
10. **Versions.** Latest stable releases only, pinned exactly. Justify new
    dependencies. Install scripts must be allowlisted in `allowBuilds` in
    `pnpm-workspace.yaml`.

## Branch, PR and merge flow

- The default branch is `master`. Never commit to it directly.
- Branches are named `type/short-description`. Commits follow Conventional
  Commits and are **signed**. Never disable or bypass signing.
- Every commit builds and passes tests on its own.
- Open PRs with `gh pr create`, including `Closes #N` and test evidence.
  Update `docs/progress.md` in every PR, adding notes in issue-number order
  (never at the top, so PRs don't conflict), and this file when it is affected.
- Watch checks with `gh pr checks --watch`. Fix failures with new commits.
  Never skip, weaken or disable a check or test.
- Merge once the required checks are green with
  `gh pr merge --merge --delete-branch`. Branches need not be up to date
  until M7 (#210); rebase onto `master` and push with `--force-with-lease`
  only when the PR conflicts. Squash and rebase merges are disabled.
- Releases happen only by merging the release-please PR.

## Common pitfalls

- pnpm 12 configures dependency install scripts with `allowBuilds` in
  `pnpm-workspace.yaml`; the old `onlyBuiltDependencies` key no longer applies.
- `typescript-eslint` deprecates `tseslint.config()`. Use `defineConfig` from
  `eslint/config`.
- Relative imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- The CI workflow's only required check is `CI result`. A new CI job must be
  added to its `needs`, or its failures will not block merging. A job that
  only matters for code or packaging gets `needs: changes` and a condition on
  `needs.changes.outputs` (ADR 0007). Required checks of other workflows
  live in `.github/rulesets/master.json`; re-apply it after changing it (see
  CONTRIBUTING).
- Terminals inside VS Code export `ELECTRON_RUN_AS_NODE=1`. The E2E fixture
  strips it; strip it yourself before running `electron` by hand.
- Electron (44 and later) has no postinstall step. It downloads its binary on first use, so
  no `allowBuilds` entry is needed.
- Never use top-level `await` in the main entry. Playwright holds back the
  `ready` event until the entry module finishes evaluating, so the app hangs.
- Stryker's Vitest runner silently tests nothing under Vitest 5. We use the
  `command` runner and `vitest.mutation.config.ts`. A suspicious score means
  checking "tests per mutant" in the output.
- Mutation runs give each Vitest suite one worker and stop fast-check at the
  first failure (`vitest.mutation.setup.ts`). Undoing either makes killed
  mutants show up as timeouts.
- Stryker runs on half the CPUs (`stryker.config.mjs`). If a local run reports
  mostly timeouts, the machine is busy: lower `--concurrency` rather than
  trusting the score.
- Inside a fast-check property, don't `return expect(...)`. fast-check treats
  the returned value as the property's result.
- Scripts run under Node's type stripping, so only erasable TypeScript is
  allowed (no enums, no constructor parameter properties). `erasableSyntaxOnly`
  enforces this.
- electron-builder skips code signing on `pull_request` events but treats any
  defined `CSC_LINK`, even an empty string, as a certificate path elsewhere.
  Never set signing variables to `''`; export them only when the secret exists.
  PR checks cannot catch this, so watch the first `master` run after changing
  packaging.
- Package and smoke workflows take a `scope` input: `representative` runs
  the always-on jobs, `full` adds the `*-full` jobs, which share their steps
  through YAML anchors. Add a new format or architecture to the right half.
- Flatpak lint exceptions live in `packaging/flatpak/lint-exceptions.json`,
  each with its reason and issue. Remove an entry as soon as its issue lands.
- App chrome pages are served from `app://chrome/` on the in-memory
  `yapyap-chrome` partition. Add an operation by extending `ChromeApi` in
  `src/shared/chrome-api.ts`, the preload bridge, and a handler registered
  through `registerChromeHandlers`, which checks the sender and payload. Node's
  URL parser treats `app:` as opaque, so compare origins with `isSameOrigin`.
- A setting appears in the settings window only once YapYap acts on it: add
  it to `SETTING_FIELDS` in `src/shared/settings-fields.ts` in the PR that
  implements it. The `settings:set` handler accepts only listed fields and
  checks the whole result against the schema. A setting that changes the
  system, such as login items, goes through a `SettingEffect`
  (`settingEffects` of `createChromeFeature`), which runs before saving and
  returns the text Settings shows when the system refuses.
- UI text, setting labels, menus, dialogs and notifications included, lives
  in `src/shared/messages/en.ts`. Lint (`yapyap/no-literal-ui-text`) rejects
  literal text in renderer JSX and in `aria-label`, `title`, `placeholder`,
  `alt` and `label`, and, in the main process, in `label`, `title`,
  `message`, `detail`, `body` and `buttons` properties.
- E2E tests start the app through `launchApp` in `e2e/fixtures.ts`, which
  gives each test a throwaway `--user-data-dir`. Never launch Electron in a
  spec without it, or tests write to the developer's real profile.
- Playwright's Electron launcher emulates a light color scheme unless told
  otherwise; `launchApp` passes `colorScheme: null` so tests see YapYap's
  real theme. Visual baselines are per OS and come from CI artifacts (see
  CONTRIBUTING), never from a local run.
- Screen capture reaches the permission handler as `display-capture` (since
  Electron 45), and the legacy desktop `getUserMedia` as a `media` request with
  no device types that never reaches `setDisplayMediaRequestHandler`. Never
  grant either without a user pick; see `allowScreenCapture` in
  `src/main/permissions/session-guard.ts` and ADR 0001.
- On a Linux desktop, run E2E tests under `dbus-run-session` as well as
  `xvfb-run`: Xvfb hides the windows, but tray icons and notifications go
  through the session bus and would appear on the developer's desktop.
- E2E runs drop `WAYLAND_DISPLAY` so local runs use the virtual X11 display
  like CI. `YAPYAP_E2E_WAYLAND_DISPLAY` passes a compositor socket through
  instead; CI runs `display.spec.ts` that way on a headless Weston. Under it no window manager focuses windows, so tests that need a
  focused window focus it and poll `isFocused()`.
- WhatsApp runs in an account view inside the main window, whose own page
  stays empty. In E2E tests, get its page with `whatsAppPage(app)` from
  `e2e/fixtures.ts` and its web contents with
  `webContents.getAllWebContents()` by URL; `BrowserWindow.fromWebContents`
  gives its window. `BrowserWindow.getAllWindows()` has no stable order once
  a chrome window is open, so never pick a window by index.
- WhatsApp never runs in the default session: each account has its own
  `persist:account-<uuid>` partition (`partitionOf`, ADR 0001), listed in
  `accounts.json`. Per-session guards such as downloads go on the account's
  session; in E2E tests, reach it through the WhatsApp page's web contents.
- Window geometry lives in `window-state.json`, not in settings: it is state,
  not a preference, and must never trigger a settings migration.
- YapYap refuses to start with `--no-sandbox` or `ELECTRON_DISABLE_SANDBOX`.
  Playwright passes `--no-sandbox` to Electron unless `chromiumSandbox: true`
  is set, which `launchApp` does. Linux runs need unprivileged user
  namespaces for the sandbox: CI lifts Ubuntu's restriction, and VS Code's
  AppArmor profile grants them to terminals inside it.
- WhatsApp's views have one preload, `src/preload/whatsapp/`, which replaces
  the page's `Notification` (ADR 0011). `installNotificationShim` runs in
  WhatsApp's main world as source text, so it may use nothing from outside
  its body; check `out/preload/whatsapp.cjs` after changing it. Its bridge
  has three operations, and the main process checks everything it sends.
- Code that inspects WhatsApp's page lives in `src/adapter/` and runs in the
  adapter's isolated world (`ADAPTER_WORLD_ID`). Probes return plain flags,
  never page text, which can contain chats. They run on demand and never add
  observers. Selectors live only in `LANDMARKS` (`src/adapter/page-state.ts`):
  change one together with the fake page, and bump `LANDMARKS_VERSION`.
- Phone numbers in fixtures and E2E tests come from Ofcom's fictional range
  (`+44 7700 900xxx`); the fixture linter rejects any other.
- Never let a rejected `loadURL` end startup. Load failures are reported by
  the recovery monitor (`src/main/recovery/`), which shows the recovery
  screen.
- Create windows only with `createSecureWindow` in
  `apps/desktop/src/main/windows.ts`. Lint rejects `new BrowserWindow`,
  `BaseWindow`, `BrowserView` and `WebContentsView` anywhere else, and new
  per-web-contents guards go in `web-contents-guards.ts`.
- Packaged builds disable the Node inspector fuse, so Playwright's Electron
  launcher cannot drive them. The smoke test connects over CDP through the
  `DevToolsActivePort` file in the profile directory instead.
