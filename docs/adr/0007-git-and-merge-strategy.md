# 0007. Git and merge strategy

- Status: Accepted
- Date: 2026-10-18

## Context

We want a history that reads as small, meaningful, signed commits grouped by
pull request, with `master` always green and releases fully automated.

## Decision

- The default branch is `master` (the maintainer's choice). Wherever project
  documents say "main branch", they mean `master`.
- **Rulesets on `master`**: pull request required, required status checks with
  "require branches to be up to date", signed commits required, no force
  push, no deletion, conversation resolution required. **Ruleset on tags**
  `v*`: no deletion, no update, creation restricted to release automation.
- **Branches**: `type/short-description`, where `type` is a Conventional
  Commits type (`feat`, `fix`, `docs`, `ci`, `build`, `chore`, `refactor`,
  `test`, `perf`).
- **Commits**: Conventional Commits, enforced by commitlint locally and in CI
  on every commit of the PR. Each commit builds and passes tests on its own.
  All commits are signed; signing is never bypassed.
- **Semi-linear merge**: before merging, the branch is rebased onto the
  latest `master` (and tidied if needed), force-pushed with `--force-with-lease`,
  and re-checked. It is then merged with a **merge commit**
  (`gh pr merge --merge --delete-branch`). GitHub signs the merge commit, and
  the branch commits keep their own signatures. Squash and rebase merging are
  disabled in repository settings, because GitHub's rebase-merge re-creates
  commits and drops their signatures.
- **PR titles** follow Conventional Commits (checked in CI) and become the
  merge commit subject.
- **Dependabot**: grouped weekly updates with a 3-day cooldown. Patch and
  minor updates get auto-merge (`gh pr merge --auto --merge`) once all checks
  pass.
- **Releases**: release-please keeps a release PR on `master`. Merging it tags
  `vX.Y.Z`, writes CHANGELOG and creates the GitHub Release. That triggers
  the release build. Nobody tags by hand.

## Consequences

- Required checks don't run on PRs opened with the default `GITHUB_TOKEN`.
  release-please therefore needs a GitHub App or fine-grained token
  (`RELEASE_PLEASE_TOKEN`) for its PR to be mergeable. Until one exists, the
  maintainer re-triggers checks by hand. This is tracked as a
  `needs-maintainer` issue.
