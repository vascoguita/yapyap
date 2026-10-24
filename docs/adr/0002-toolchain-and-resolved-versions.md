# 0002. Toolchain and resolved versions

- Status: Accepted
- Date: 2026-10-18

## Context

The project must use the latest stable release of every runtime, tool,
dependency and GitHub Action, pinned exactly with a lockfile. Every version
must be verified against its registry or release page, never taken from
memory. Dependencies must be minimal, and each one must be justified.

## Decision

### Repository layout (pnpm workspaces)

```
apps/desktop          Electron app (main, preloads, chrome renderer, WhatsApp adapter, plugin host)
packages/sdk          @yapyap/plugin-sdk: typed plugin API, manifest JSON Schema
packages/plugin-sign  @yapyap/plugin-sign: Ed25519 signing and verification CLI
plugins/ai-assistant  bundled first-party AI writing assistant
plugins/example       minimal example plugin
docs                  VitePress site
```

### Resolved versions (verified 2026-10-18)

Versions were checked against the npm registry (`npm view <pkg> dist-tags.latest`),
`nodejs.org/dist/index.json`, `releases.electronjs.org`, and the GitHub
Releases API. Pre-release, beta and nightly versions are never used.

#### Runtimes

| Tool     | Version | Notes                                                                       |
| -------- | ------- | --------------------------------------------------------------------------- |
| Node.js  | 24.22.0 | Latest Active LTS ("Krypton"). Matches the Node bundled in Electron 45.0.0. |
| pnpm     | 12.14.0 | Pinned via `packageManager` (Corepack)                                      |
| Electron | 45.0.0  | Chromium 156.0.8078.48                                                      |

#### Build and language

| Package          | Version | Notes                                          |
| ---------------- | ------- | ---------------------------------------------- |
| typescript       | 6.0.3   | See "TypeScript 7" below                       |
| electron-vite    | 6.0.0   |                                                |
| vite             | 8.3.4   |                                                |
| electron-builder | 26.15.3 |                                                |
| electron-updater | 6.8.9   | Runtime dependency, self-updating targets only |
| @electron/fuses  | 2.1.3   |                                                |

#### Quality and tests

| Package                                                                                   | Version |
| ----------------------------------------------------------------------------------------- | ------- |
| eslint                                                                                    | 10.13.0 |
| @eslint/js                                                                                | 10.0.1  |
| typescript-eslint                                                                         | 8.71.2  |
| prettier                                                                                  | 3.9.10  |
| knip                                                                                      | 6.42.0  |
| vitest, @vitest/coverage-v8                                                               | 5.0.5   |
| @playwright/test                                                                          | 1.64.1  |
| axe-core (evaluated directly; Electron cannot open the page `@axe-core/playwright` needs) | 4.14.0  |
| @stryker-mutator/core (command runner; see ADR 0008, C12)                                 | 10.0.0  |
| happy-dom                                                                                 | 21.0.3  |
| @testing-library/preact                                                                   | 3.2.4   |
| @commitlint/cli, @commitlint/config-conventional                                          | 21.2.4  |
| @types/node                                                                               | 26.6.5  |

#### Runtime dependencies

| Package           | Version | Justification                                                                                                                                                                                                            |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| preact            | 11.0.1  | About 4 KB UI runtime for app chrome. TSX type-checks under strict lint. Unlike shadow-DOM component libraries, ARIA references work across components.                                                                  |
| @preact/signals   | 2.11.3  | Fine-grained state for chrome UI without a store library                                                                                                                                                                 |
| typebox           | 1.4.2   | One schema source gives TS types and publishable JSON Schema (plugin manifest, RPC, settings). Its interpreter-mode validation needs no `eval`.                                                                          |
| fflate            | 0.8.3   | Zero-dependency zip reader for `.yapyap-plugin` bundles                                                                                                                                                                  |
| electron-updater  | 6.8.9   | Signed update metadata for AppImage, NSIS and macOS only                                                                                                                                                                 |
| @anthropic-ai/sdk | 1.2.0   | The AI assistant plugin's Anthropic provider (#103): the vendor's own streaming, error types, retries and timeouts, bundled into the plugin only; 1.2.0 because pnpm's one-day release-age policy still holds back 1.3.0 |

Everything else is written in-house and kept small: logging with redaction,
settings store, i18n catalogs, and the RPC layer.

#### Docs

| Package                          | Version         |
| -------------------------------- | --------------- |
| vitepress                        | 1.6.4           |
| typedoc, typedoc-plugin-markdown | 0.28.20, 4.14.1 |

#### Supply chain

| Package                     | Version |
| --------------------------- | ------- |
| @cyclonedx/cyclonedx-npm    | 6.0.1   |
| license-checker-rseidelsohn | 5.0.1   |

#### GitHub Actions (pinned by commit SHA)

| Action                              | Tag     | SHA                                      |
| ----------------------------------- | ------- | ---------------------------------------- |
| actions/checkout                    | v7.0.1  | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node                  | v7.1.0  | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| pnpm/action-setup                   | v6.1.0  | ea17c68df8912ef543352723c149a84f56e3d413 |
| actions/cache                       | v6.1.0  | 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 |
| actions/upload-artifact             | v7.0.2  | cf430e030ddbb5b0abf93d22962f4752f3646cd9 |
| actions/download-artifact           | v8.0.2  | 9000827ccba6bdab643e8b6fd33ac0654aef8333 |
| actions/configure-pages             | v6.0.0  | 45bfe0192ca1faeb007ade9deae92b16b8254a0d |
| actions/upload-pages-artifact       | v5.0.0  | fc324d3547104276b827a68afc52ff2a11cc49c9 |
| actions/deploy-pages                | v5.0.1  | 368f82528645a54fb793d4d04e342629a3f51346 |
| actions/attest-build-provenance     | v4.2.2  | 4d101475d8b20a2381f78447822ac1eab6504dd8 |
| actions/dependency-review-action    | v5.0.0  | a1d282b36b6f3519aa1f3fc636f609c47dddb294 |
| github/codeql-action                | v4.39.0 | 6f2ac81f5cd81fe351a197ba0b00d91d03cd2aee |
| ossf/scorecard-action               | v2.5.0  | fa7117db83c52d787ae5a89f350999701505d78e |
| googleapis/release-please-action    | v5.0.0  | 45996ed1f6d02564a971a2fa1b5860e934307cf7 |
| amannn/action-semantic-pull-request | v6.1.1  | 48f256284bd46cdaab1048c3721360e808335d50 |
| dependabot/fetch-metadata           | v3.1.0  | 25dd0e34f4fe68f24cc83900b1fe3fe149efef98 |
| anchore/sbom-action                 | v0.24.3 | 66cbf4bc1f1c0d2edc94016e65bc221b6bb0ad6c |
| flatpak/flatpak-github-actions      | v6.8    | 79327416609af08178ad73b352877e51450790b3 |

#### Flatpak

| Component                        | Version |
| -------------------------------- | ------- |
| org.freedesktop.Platform / Sdk   | 26.08   |
| org.electronjs.Electron2.BaseApp | 26.08   |

These versions sit outside Dependabot's reach. A weekly workflow
(`.github/workflows/pinned-versions.yml`) checks them, and the Node.js LTS
line, and opens a PR when a newer stable release exists.

### TypeScript 7

`typescript@7.0.2` is the npm `latest`. However, `typescript-eslint@8.71.2`
declares `typescript >=4.8.4 <6.1.0` and `typedoc@0.28.20` declares
`typescript 6.0.x`. Both are required by this project (strict type-checked
linting, SDK API reference). We pin TypeScript 6.0.3, the newest release that
satisfies every peer. Dependabot will propose 7.x, and we adopt it once its
peers support it. This conflict is logged in [ADR 0008](0008-requirement-conflicts.md).

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

## Consequences

- Upgrades arrive as grouped weekly Dependabot PRs with a 3-day cooldown.
  Patch and minor updates auto-merge once all checks pass.
- TypeScript is one major behind `latest` until the lint and doc toolchain
  catches up.
