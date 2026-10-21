# 0009. Performance budgets

- Status: Accepted
- Date: 2026-10-21

## Context

A desktop wrapper is judged on how fast it opens and how much memory it
holds while it sits in the background all day. Regressions creep in one
dependency or feature at a time, and nobody notices until users do. CI
runners are slower and noisier than a developer's machine, so one-off
timings in PRs would flap.

## Decision

- **What is measured.** A Playwright benchmark (`apps/desktop/e2e/bench/`,
  `pnpm test:bench`) launches the development build eight times (one warm-up, then seven measured), each on a
  fresh profile against the local fake WhatsApp page, and takes the median
  of two numbers:
  - **Cold start:** from starting the process to WhatsApp's page being
    visible.
  - **Idle memory:** the sum of every YapYap process's working set (Electron
    `getAppMetrics`), ten seconds after the page appeared. Shared pages count
    once per process, so this overstates real use, but it is the same measure
    on every OS and moves when YapYap's own footprint moves.
- **What it measures against.** The fake page is tiny, so the numbers are
  YapYap's own overhead, not WhatsApp's. One account is measured until
  multi-account (M3) adds a per-account figure.
- **Budgets** live in `apps/desktop/e2e/bench/budgets.json`, per OS. Memory
  is steady on CI runners (within 1–2 MB across runs), so its budget sits
  25% above the measured median. Cold start is not: on the same runner image
  one Linux run spread from 338 ms to 2619 ms. So the cold-start budget is
  about twice the higher of two calibration medians, which catches a real
  regression (a feature that doubles start-up) without failing on noise.
  Calibrated on 2026-10-21:

  | Runner         | Cold start (two runs) | Idle memory | Budget          |
  | -------------- | --------------------- | ----------- | --------------- |
  | ubuntu-latest  | 531 ms, 1106 ms       | 555 MB      | 2200 ms, 690 MB |
  | windows-latest | 936 ms, 771 ms        | 313 MB      | 2000 ms, 390 MB |
  | macos-latest   | 1444 ms, 1252 ms      | 411 MB      | 3500 ms, 510 MB |

- **Warm-up.** The first launch on a fresh runner takes 3–7 s while the disk
  cache fills. The benchmark makes one warm-up launch and leaves it out, then
  takes the median of seven.
- **When it runs.** Nightly on Linux, Windows and macOS runners, and on any
  PR that changes the benchmark or its budgets. A median over budget fails
  the run. Results are kept as artifacts for 30 days.
- **Changing a budget** needs a PR that says why: a deliberate feature cost,
  or new runner hardware.

## Consequences

- Regressions surface within a day, with the run that introduced them easy
  to find in the nightly history.
- The benchmark is not a PR gate, so a regression can merge and be caught
  the next morning. That trades a day's delay for PRs that never fail on
  runner noise.
- Budgets must be revisited when the measured setup changes, for example
  when accounts arrive or the fake page grows.
