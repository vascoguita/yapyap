# Progress

This page holds the project's current state, the conventions that do not fit
elsewhere, and short notes on what each pull request changed. Decisions and
their reasons belong in the ADRs (`docs/adr/`), and released changes in
`CHANGELOG.md`. Git history keeps the long versions of older notes.

## Current state (2026-11-16)

- **Latest stable release:** v0.3.0 (2026-11-14). **Latest beta:**
  v0.3.1-beta.3 (2026-11-16). The release-please PR for 0.3.1 is open.
  Releases happen only by merging it, and a release needs a published beta
  of its version first (#184).
- **Next:** M8 (#119 Flathub, #118 the final audit and v1.0.0).
- **Waiting on the maintainer:** #24 (Windows code signing), #25 (AUR
  credentials), #402 (renew the macOS certificate before 2027-11-25).
- **Open outside milestones:** #345 (winget and Scoop).
  See `gh issue list` for the live list.

| Milestone                                            | Status                           |
| ---------------------------------------------------- | -------------------------------- |
| M0 · Research and ADRs                               | Done                             |
| M1 · Bootstrap                                       | Done, except #24 and #25         |
| M2 · Single-account shell                            | Done                             |
| M3 · Accounts, tray, notifications, updates (v0.1.0) | Done                             |
| M4 · Remaining desktop features (v0.1.x)             | Done                             |
| M5 · Extension platform                              | Done; removed by ADR 0018 (#571) |
| M6 · AI writing assistant (v0.2.0)                   | Done; made part of YapYap (#505) |
| M7 · Hardening                                       | Done                             |
| M8 · Docs and v1.0.0                                 | In progress (#118, #119)         |

## Conventions

- **One file per note.** A pull request adds its note as
  `docs/progress/notes/<issue>.md`, named by the issue it closes, which the
  note cites first, as in "Topic (#123): ...". Pull requests for different
  issues never edit the same file, so merging one does not put the others
  in conflict (#660); a later pull request for the same issue adds a
  paragraph to its file. This page lists the notes in issue-number order,
  and `pnpm lint` checks their names. Keep a note to a few lines: what
  changed and where to look. Put the reasons in an ADR (ADR 0008 for
  conflicts).
- **Planned features.** The website marks unshipped features as planned.
  When a feature ships, drop its "(planned)" marker and add its settings,
  files and flags to `docs/guide/reference.md`.
- **Settings sections.** A new section must be listed in
  `EXPORTED_SECTIONS` or `LOCAL_SECTIONS` (`settings/transfer.ts`); a test
  fails until it is.
- **Advisories.** A build-only advisory without an upstream fix is resolved
  with an `override` in `pnpm-workspace.yaml`, with a comment saying why and
  when to remove it.
- **Test-only switches.** `YAPYAP_TEST_*` variables (the WhatsApp origin and
  the model servers' ports) point E2E tests at local fakes.
  Packaged builds ignore them.
- **Releases.** release-please keeps the release PR on `master`, and the
  release workflow merges each change's commit and merge-commit entries
  into one changelog entry (`merge-changelog.ts`, #358).
- **Identity.** The site is https://yapyap.guita.org (a GitHub Pages custom
  domain), and the app ID is `org.guita.YapYap`. Ensita supports YapYap's
  development and is credited in the README, the site footer and the About
  window. Sponsorships go through GitHub Sponsors (#196).

## Notes

<script setup lang="ts">
import { data as notes } from '../.vitepress/theme/progress-notes.data.ts';
</script>

<ul>
  <li v-for="note in notes" :key="note.issue" v-html="note.html" />
</ul>
