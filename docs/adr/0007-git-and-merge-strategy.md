# 0007. Git and merge strategy

- Status: Accepted
- Date: 2026-10-18

## Context

We want a history that reads as small, meaningful, signed commits grouped by
pull request, with `master` always green and releases fully automated.

## Decision

- The default branch is `master` (the maintainer's choice). Wherever project
  documents say "main branch", they mean `master`.
- **Rulesets on `master`**: pull request required, required status checks,
  signed commits required, no force push, no deletion, conversation
  resolution required. **Ruleset on tags** `v*`: no deletion, no update,
  creation restricted to release automation.
- **Required checks**: the CI workflow reports one check, `CI result`, which
  fails if any CI job failed or was cancelled and passes when each job
  passed or was skipped. The checks of the other workflows (CodeQL,
  dependency review, audit, PR title, docs build) stay required on their
  own. A new CI job joins `CI result`'s `needs`; the ruleset does not change.
- **What a pull request runs** (2026-10-22, to unblock CI as the
  bottleneck): a change to documentation only (`*.md`, `docs/`, issue
  templates) runs lint, typecheck and the docs build, and skips tests, E2E,
  mutation, SonarQube Cloud and packaging. A code change packages and
  smoke-tests one format per system (AppImage x64, NSIS x64, DMG); the full
  format and architecture matrix runs when packaging inputs change (package
  manifests, lockfile, electron-builder and Flatpak configuration, packaging
  and release scripts and workflows) and on every push to `master`; see
  the 2026-11-16 amendment below. `scripts/src/ci/changes.ts` decides, with
  tests. Mutation testing runs on pull requests only, against the tests that
  import the mutated files. **"Require branches to be up to date" is off**,
  so a merge does not force every other pull request to rerun; the `master`
  run after each merge catches the rare conflict between two pull requests.
- **Fewer jobs per pull request** (amended 2026-11-16, #657). A run for
  #646 took 42 minutes, though no job ran longer than 7: its 34 CI jobs
  (40 with the other workflows) waited up to 29 minutes for GitHub's free
  runners, which take about 20 jobs at once and about 5 on macOS. Waiting,
  not working, is the cost, so a pull request now starts only the jobs its
  change can fail:
  - **Mutation** runs one job per five changed in-scope modules, so most
    changes start one job, and a change with none starts no job. The
    nightly run still mutates every module in 16 shards.
  - **macOS** tests, E2E, packaging and smoke tests run when the change
    holds macOS-specific code (a changed file that mentions `darwin`, the
    platform's name in Node.js), a `.plist`, dependencies (package
    manifests, lockfile, workspace, `.nvmrc`), packaging configuration or
    the CI workflow. Other changes run Linux and Windows only.
  - **Packaging**: a code change packages and smoke-tests one format per
    system, as before. Dependency updates now get that too, macOS
    included; the full format and architecture matrix runs when packaging
    configuration changes (electron-builder and Flatpak configuration,
    packaging and release scripts, the packaging workflows and the setup
    action), on every push to `master`, nightly, and on the release-please
    pull request, which runs everything.
  - **Package repositories** follows the full packaging matrix, since its
    test builds stand-in packages that app code cannot affect, and
    **Renovate config** runs when `.github/renovate.json` or the CI
    workflow, which pins the validating Renovate, changes.

  `CI result` and the other required checks are unchanged: a skipped job
  passes, a failed or cancelled one does not. The cost is that a macOS-only
  or arm64-only break in code that names neither can reach `master`; its
  run, and the nightly one, show it within one merge, and nothing ships
  without the full matrix.

- **Releases are the hard gate, `master` is guarded after the fact**
  (amended 2026-11-04, #210). Both choices above began as a temporary
  shortcut until M7 and are now the long-term design: on a personal account
  GitHub offers no merge queue, and the up-to-date rule with the full matrix
  on every pull request would rebase and rerun every open pull request,
  Renovate's included, whenever anything merges. Instead:
  - every push to `master` runs everything, including the full packaging and
    smoke matrix, so a conflict between two pull requests shows within one
    merge and is fixed forward or reverted;
  - nothing reaches users without the full matrix: the release-please pull
    request changes package manifests, so it runs it, and betas and
    releases package and smoke-test every format before publishing, with a
    beta before every stable release (#184);
  - the merge script rebases a pull request that is behind `master` before
    merging it.

  Revisit this when the repository moves to an organization (use a merge
  queue that runs the full matrix on `merge_group`, which CI already
  listens to) or when several people merge (turn the up-to-date rule on).

- **Branches**: `type/short-description`, where `type` is a Conventional
  Commits type (`feat`, `fix`, `docs`, `ci`, `build`, `chore`, `refactor`,
  `test`, `perf`).
- **Commits**: Conventional Commits, enforced by commitlint locally and in CI
  on every commit of the PR. Each commit builds and passes tests on its own.
  All commits are signed; signing is never bypassed.
- **Merging**: a branch that conflicts with `master` is rebased onto it (and
  tidied if needed), force-pushed with `--force-with-lease`, and re-checked.
  It is merged with a **merge commit**
  (`gh pr merge --merge --delete-branch`). GitHub signs the merge commit, and
  the branch commits keep their own signatures. Squash and rebase merging are
  disabled in repository settings, because GitHub's rebase-merge re-creates
  commits and drops their signatures.
- **Progress notes** (amended 2026-11-16, #660): every pull request adds a
  short note, and they used to share one list in `docs/progress.md`. Even
  in issue-number order (#634), new pull requests have the newest issues,
  so they all added at the end and each merge put the others in conflict:
  they rebased and reran all of CI, the day's runs were mostly such reruns,
  and they queued behind each other. Each note is now its own file,
  `docs/progress/notes/<issue>.md`, named by the issue its pull request
  closes, and the docs site lists them in issue-number order; lint checks
  the names. Dropping notes for the changelog was simpler, but the notes
  say where to look in the code, which commit subjects do not.
- **PR titles** follow Conventional Commits (checked in CI) and become the
  merge commit subject. release-please therefore lists a change twice, for
  its commit and its merge commit; the release workflow merges each pair
  into one entry, linking the pull request, in the release PR's changelog
  and body (#358).
- **Renovate** (ADR 0020): grouped updates on Mondays, each release at
  least 3 days old. Minor and patch groups get GitHub's auto-merge, with a
  merge commit, once all checks pass. Dependabot only opens security
  updates.
- **Releases**: release-please keeps a release PR on `master`. Merging it tags
  `vX.Y.Z`, writes CHANGELOG and creates the GitHub Release. That triggers
  the release build. Nobody tags by hand.

## Amendments

- 2026-11-16 (#641): Renovate replaced Dependabot's version updates (ADR
  0020), and release-please and Renovate now use the automation App's
  token instead of `AUTOMATION_TOKEN`, so the pinned-versions workflow and
  the hand re-triggering are gone.

## Consequences

- Required checks don't run on PRs opened with the default `GITHUB_TOKEN`.
  release-please and Renovate therefore work through a short-lived token
  from the YapYap automation GitHub App, so their PRs are mergeable (see
  CONTRIBUTING.md, "Automation app").
