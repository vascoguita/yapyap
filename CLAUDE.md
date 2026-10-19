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

| Task                            | Command                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| Install                         | `pnpm install` (CI: `pnpm install --frozen-lockfile`)                     |
| Run the app (hot reload)        | `pnpm dev`                                                                |
| Build all packages              | `pnpm build`                                                              |
| Lint (ESLint + Prettier + knip) | `pnpm lint`                                                               |
| Format                          | `pnpm format`                                                             |
| Typecheck                       | `pnpm typecheck`                                                          |
| Unit + integration tests        | `pnpm test`                                                               |
| Coverage (100% gate)            | `pnpm test:coverage`                                                      |
| E2E tests                       | `xvfb-run -a pnpm test:e2e` on Linux when available, else `pnpm test:e2e` |
| Mutation tests (≥ 90%)          | `pnpm test:mutation` (PR CI mutates changed in-scope files only)          |
| Commit messages                 | `pnpm commitlint`                                                         |
| License compatibility           | `pnpm check:licenses`                                                     |
| Vulnerability audit             | `pnpm audit --audit-level high`                                           |
| Docs site (dev / build)         | `pnpm docs:dev` / `pnpm docs:build`                                       |

Later milestones add `pnpm package`. Update this table in the PR that adds
each command.

## Architecture map

| Part             | Path                                        | Notes                                                                                   |
| ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Main process     | `apps/desktop/src/main/`                    | App lifecycle, windows, IPC validation, settings, updates                               |
| Preloads         | `apps/desktop/src/preload/`                 | Minimal typed `contextBridge` APIs, one per zone                                        |
| Chrome renderer  | `apps/desktop/src/renderer/`                | YapYap's own UI (Preact), served from `app://`                                          |
| WhatsApp adapter | `apps/desktop/src/adapter/`                 | **The only place** with WhatsApp DOM knowledge; versioned selectors; returns plain data |
| Plugin host      | `apps/desktop/src/main/plugins/`            | Sandboxed plugin renderers, RPC, capabilities, signatures                               |
| Plugin SDK       | `packages/sdk/`                             | Typed plugin API and manifest JSON Schema (TSDoc on every export)                       |
| Signing CLI      | `packages/plugin-sign/`                     | Ed25519 signing and verification (PKCS#8 PEM keys)                                      |
| Plugins          | `plugins/ai-assistant/`, `plugins/example/` | First-party plugins                                                                     |
| Docs             | `docs/`                                     | VitePress site, ADRs in `docs/adr/`                                                     |
| Repo automation  | `scripts/`                                  | Tested automation such as pinned-version checks; entries in `scripts/src/bin/`          |

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
  Update `docs/progress.md` in every PR, and this file when it is affected.
- Watch checks with `gh pr checks --watch`. Fix failures with new commits.
  Never skip, weaken or disable a check or test.
- Before merging, rebase onto the latest `master`, push with
  `--force-with-lease`, and wait for green. Then
  `gh pr merge --merge --delete-branch`. Squash and rebase merges are
  disabled.
- Releases happen only by merging the release-please PR.

## Common pitfalls

- pnpm 12 configures dependency install scripts with `allowBuilds` in
  `pnpm-workspace.yaml`; the old `onlyBuiltDependencies` key no longer applies.
- `typescript-eslint` deprecates `tseslint.config()`. Use `defineConfig` from
  `eslint/config`.
- Relative imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- Adding or renaming a required CI job means updating
  `.github/rulesets/master.json` and re-applying it (see CONTRIBUTING), or PRs
  will wait forever for a check that never reports.
- Terminals inside VS Code export `ELECTRON_RUN_AS_NODE=1`. The E2E fixture
  strips it; strip it yourself before running `electron` by hand.
- Electron 44 has no postinstall step. It downloads its binary on first use, so
  no `allowBuilds` entry is needed.
- Never use top-level `await` in the main entry. Playwright holds back the
  `ready` event until the entry module finishes evaluating, so the app hangs.
- Stryker's Vitest runner silently tests nothing under Vitest 5. We use the
  `command` runner and `vitest.mutation.config.ts`. A suspicious score means
  checking "tests per mutant" in the output.
- Scripts run under Node's type stripping, so only erasable TypeScript is
  allowed (no enums, no constructor parameter properties). `erasableSyntaxOnly`
  enforces this.
