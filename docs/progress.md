# Progress

- **Current milestone:** M2 · Single-account shell
- **Last merged PR:** #166 (zoom)
- **Next issue:** #49 (clipboard), #50 (downloads), #51 (media)
- **Open blockers:** #22 (`AUTOMATION_TOKEN`), #23, #24, #25, #26, #138 need maintainer-provided secrets or settings (pipelines skip those steps gracefully)

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

- The release-please PR stays open until M3 is complete. Merging it ships v0.1.0.
- Build-only advisories without an upstream fix are resolved with `overrides` in
  `pnpm-workspace.yaml`, each with a comment explaining why.
