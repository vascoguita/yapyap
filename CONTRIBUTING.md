# Contributing to YapYap

Thanks for helping make YapYap better. This guide covers how to set up your
environment, how changes flow into `master`, and the rules every change follows.
By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

1. **Priorities.** When requirements conflict, the order is: security, then
   correctness, then user privacy, then confidentiality, then tests and
   coverage, then performance, then code style. Record any conflict in
   [ADR 0008](docs/adr/0008-requirement-conflicts.md).
2. **Never automate a real WhatsApp account.** Tests use the local fake
   WhatsApp page in `apps/desktop/test/fake-whatsapp/`.
3. **Privacy.** No telemetry. Never log, persist or put in fixtures any
   message content, phone numbers, names or secrets.
4. **Clean room.** Implement features from their description. Never copy code
   from other projects whose licenses are incompatible with MIT.
5. **Comments explain why, never what.** Good reasons for a comment are
   non-obvious constraints, WhatsApp quirks, security reasoning, and
   workarounds (with a link to the YapYap issue). No commented-out code, and no
   TODOs: open an issue instead.
6. **Tests.** 100% line and branch coverage. Coverage-ignore directives are
   forbidden.
7. **Dependencies.** Keep them minimal and justify each new one in the PR
   description or an ADR.

## Development setup

You need Node.js 24 LTS and pnpm (version pinned in `package.json`, enable it
with `corepack enable`). On Linux, `xvfb-run` keeps E2E test windows off your
desktop.

```sh
pnpm install            # install (frozen lockfile in CI)
pnpm dev                # run the desktop app with hot reload
pnpm lint               # ESLint + Prettier check + knip
pnpm typecheck          # tsc across the workspace
pnpm test               # unit + integration tests
pnpm test:coverage      # tests with the 100% coverage gate
pnpm test:e2e           # Playwright E2E (uses xvfb-run on Linux when available)
pnpm test:mutation      # Stryker mutation testing
pnpm build              # build every package
pnpm package            # build installers for the current OS
```

`CLAUDE.md` has the full command list and an architecture map.

## Workflow

1. Pick an issue and move it to **In Progress** on the
   [project board](https://github.com/users/vascoguita/projects/5).
2. Create a branch `type/short-description` (for example
   `feat/tray-unread-count`).
3. Make small, focused commits. Each one builds and passes tests on its own.
4. Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
   and **must be signed**.
5. Open a PR that links the issue (`Closes #N`) and includes test evidence.
   Update `docs/progress.md`, and `CLAUDE.md` if your change affects it.
6. When checks are green, rebase onto the latest `master`, push with
   `--force-with-lease`, and wait for checks again.
7. Merge with a merge commit (`gh pr merge --merge --delete-branch`). Squash
   and rebase merges are disabled so that branch commits keep their
   signatures.

See [ADR 0007](docs/adr/0007-git-and-merge-strategy.md) for the reasoning.

## Repository settings

These settings are applied through the GitHub API and must stay in place.

- **Merging:** merge commits only (squash and rebase disabled), auto-merge
  allowed, head branches deleted after merge.
- **Security:** secret scanning with push protection, Dependabot alerts and
  security updates, private vulnerability reporting. Discussions are enabled.
- **Pages:** the source is GitHub Actions, not a branch.
- **Rulesets:** stored as JSON in [`.github/rulesets/`](.github/rulesets/).
  - `master`: pull request required, merge commits only, required status
    checks with "branch must be up to date", signed commits, no force push,
    no deletion, conversation resolution required.
  - `release tags`: `v*` tags cannot be deleted, moved or updated.

  After changing a ruleset file (for example when a required CI job is
  added or renamed), apply it:

  ```sh
  id=$(gh api repos/vascoguita/yapyap/rulesets --jq '.[] | select(.name=="master") | .id')
  gh api -X PUT "repos/vascoguita/yapyap/rulesets/$id" --input .github/rulesets/master.json
  ```

## Secrets and maintainer-only steps

The pipelines skip steps whose secrets are missing, and print a notice in the
job summary instead of failing.

| Secret / variable                                                                          | Used for                                          | Missing →                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------- |
| `PLUGIN_SIGNING_KEY` (secret)                                                              | Signing first-party plugins (PKCS#8 PEM, Ed25519) | First-party plugins are not signed; release blocked |
| `PLUGIN_SIGNING_PUBLIC_KEY` (variable)                                                     | Embedded first-party trust anchor (SPKI PEM)      | Build fails                                         |
| `RELEASE_PLEASE_TOKEN`                                                                     | Release PRs that trigger required checks          | Maintainer re-runs checks by hand                   |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS signing and notarization                    | Unsigned DMG, no macOS self-update                  |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                                                     | Windows Authenticode signing                      | Unsigned installers (SmartScreen warning)           |
| `AUR_SSH_KEY`                                                                              | Publishing `yapyap-bin` to the AUR                | PKGBUILD attached to the release only               |

Issues that need one of these are labelled `needs-maintainer`.

## Plugin signing key rotation

First-party plugins are verified against public keys embedded in the app.
To rotate the key without breaking installed plugins:

1. Generate a new Ed25519 key pair offline:
   `openssl genpkey -algorithm ed25519 -out new.pem`, then
   `openssl pkey -in new.pem -pubout`. Never commit or log the private key.
2. Add the new public key to the embedded trust anchors (keep the old one) and
   ship that in a release.
3. In a later release, update the `PLUGIN_SIGNING_KEY` secret and the
   `PLUGIN_SIGNING_PUBLIC_KEY` variable, and sign first-party plugins with the
   new key.
4. One release after that, remove the old public key from the anchors.

## Reporting bugs and security issues

Use the issue forms for bugs and features. Report vulnerabilities privately as
described in [SECURITY.md](SECURITY.md).
