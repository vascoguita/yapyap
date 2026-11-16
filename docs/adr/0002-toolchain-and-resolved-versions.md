# 0002. Toolchain and resolved versions

- Status: Accepted
- Date: 2026-10-18

## Context

The project must use the latest stable release of every runtime, tool,
dependency and GitHub Action, pinned exactly with a lockfile. Every version
must be verified against its registry or release page, never taken from
memory. Dependencies must be minimal, and each one must be justified.

## Decision

Exact versions live in the manifests and lockfile, not here: the root and
workspace `package.json` files and `pnpm-lock.yaml` for npm packages,
`.nvmrc` and `engines` for Node.js, `packageManager` for pnpm, the workflow
files for GitHub Actions (pinned by commit SHA), and the Flatpak manifest for
its runtime. This ADR records the choices and their reasons.

### Repository layout (pnpm workspaces)

```
apps/desktop  Electron app (main, preloads, chrome renderer, WhatsApp adapter, AI assistant, MCP server)
scripts       tested repository automation
docs          VitePress site
```

### Versions

- Only the latest stable release of each runtime, tool, dependency and
  action, pinned exactly. Pre-release, beta and nightly versions are never
  used. Each version is checked against its registry or release page, never
  taken from memory.
- **Node.js:** the latest Active LTS line, matching the Node bundled in
  Electron where possible. **pnpm:** pinned through `packageManager`.
- **GitHub Actions** are pinned by commit SHA, with the tag in a comment.
- Renovate keeps every pinned version current (ADR 0020). Its custom
  managers in `.github/renovate.json` also track versions no package
  manager knows: the Node.js LTS line and the Flatpak runtime and base app.

### Build and test tools

- **electron-vite** builds the main process, preloads and renderer;
  **electron-builder** packages every format; **@electron/fuses** checks the
  hardened fuses.
- **ESLint** with typescript-eslint, **Prettier** and **knip** for lint;
  **Vitest** with V8 coverage for unit and integration tests;
  **Playwright** for E2E; **Stryker** with the command runner for mutation
  tests (ADR 0008, C12).
- **axe-core** is evaluated directly, since Electron cannot open the extra
  page `@axe-core/playwright` needs.
- **happy-dom** and **@testing-library/preact** for component tests;
  **commitlint** for commit messages.
- **VitePress** for the docs site; **@cyclonedx/cyclonedx-npm** and
  **license-checker-rseidelsohn** for the SBOM and license checks.

### Runtime dependencies

| Package           | Justification                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| preact            | About 4 KB UI runtime for app chrome. TSX type-checks under strict lint. Unlike shadow-DOM component libraries, ARIA references work across components.                 |
| typebox           | One schema source gives TS types and runtime checks (settings, IPC payloads, stored files, agent tokens, model lists). Its interpreter-mode validation needs no `eval`. |
| electron-updater  | Signed update metadata for AppImage, NSIS and macOS only                                                                                                                |
| @anthropic-ai/sdk | The AI assistant's Anthropic provider: the vendor's own streaming, error types, retries and timeouts                                                                    |
| openai            | The AI assistant's OpenAI and OpenAI-compatible provider: the vendor's chat-completions streaming and error types, which self-hosted servers speak too                  |

Everything else is written in-house and kept small: logging with redaction,
settings store and i18n catalogs.

### TypeScript 7

TypeScript 7 was the npm `latest` when this ADR was written, but the
typescript-eslint release this project needs for strict type-checked
linting accepts only TypeScript 6. We pin the newest TypeScript 6 release
that satisfies every peer. Renovate proposes 7.x, and we adopt it once
its peers support it. This conflict is logged in
[ADR 0008](0008-requirement-conflicts.md) (C1).

### Install scripts

`pnpm-workspace.yaml` denies every dependency install script except those
listed in `allowBuilds` (pnpm 12's allowlist). The allowlist is empty: no
dependency currently needs an install script. Electron 44 no longer has a
postinstall step; it downloads its binary on first use instead. Every
addition must be justified in the PR that adds it.

### Lint rules (enforced in CI)

ESLint `strict-type-checked` + `stylistic-type-checked`, `complexity: 8`,
`max-lines-per-function: 40` (skipping blank lines and comments),
`no-explicit-any`, `no-non-null-assertion`, and restricted syntax for
coverage-ignore comments. `knip` fails on unused exports, files and
dependencies. Prettier checks formatting.

## Amendments

- 2026-11-01 (ADR 0017): the AI assistant moved into the app.
  `@anthropic-ai/sdk` and `openai` are now dependencies of `apps/desktop`
  and run in the main process. `@noble/hashes` is gone. (`@wllama/wllama`,
  which ran the private model, was removed with it on 2026-11-14, #627.)
  `extensions/ai-assistant` no longer exists.
- 2026-11-01: the tables of resolved versions were removed. They drifted
  with every Dependabot PR, and the manifests already pin every version.
- 2026-11-16 (#641): dropped the extension SDK, signing tool and
  `extensions/` folders from the layout, the fflate row, typedoc and the
  RPC layer, all gone with extensions (ADR 0018), and replaced Dependabot
  and the pinned-versions workflow with Renovate (ADR 0020).

## Consequences

- Upgrades arrive as grouped weekly Renovate PRs, each release at least
  3 days old. Patch and minor updates auto-merge once all checks pass.
- TypeScript is one major behind `latest` until the lint toolchain catches
  up.
