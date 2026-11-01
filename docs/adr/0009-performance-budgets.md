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

  **Recalibrated on 2026-10-29 (#428).** The same code measured more idle
  memory than a few days earlier, on the same runner image and Electron:
  commit `98910fc` used 386 MB on Windows on 2026-10-26 and 399 MB on
  2026-10-29, and about 575 MB and 650 MB on Linux. The growth is the
  runners', not YapYap's. The idle-memory budgets now sit 10% above the
  medians of 2026-10-29, not 25%, because YapYap's own memory also grew
  (Windows went from 313 MB to 386 MB in its first week), and a 25% margin
  would let that much growth pass unnoticed again:

  | Runner         | Idle memory | Budget |
  | -------------- | ----------- | ------ |
  | ubuntu-latest  | 651 MB      | 715 MB |
  | windows-latest | 399 MB      | 440 MB |
  | macos-latest   | 489 MB      | 540 MB |

  The benchmark reports each process's memory too, so the next overrun
  shows which process grew.

- **Accounts (#109).** A second benchmark (`bench/accounts.spec.ts`)
  launches three times and takes the median of two more numbers:
  - **Memory per account:** what all of YapYap's processes hold more after
    **Add Account**, both measured once settled.
  - **Hidden-account CPU:** the first account's renderer while the second is
    in front, as a share of one core over ten seconds. It uses the
    cumulative CPU time, because the per-call percentage restarts whenever
    anything reads the metrics, which YapYap's memory watchdog does.

  Memory per account sits 25% above its median, like idle memory. A hidden
  account barely runs (at most 0.4% of a core), so its budget is 2%: room
  for noise, but a hidden page that keeps animating or polling would cross
  it. Calibrated on 2026-10-24:

  | Runner         | Per account | Hidden CPU | Budget     |
  | -------------- | ----------- | ---------- | ---------- |
  | ubuntu-latest  | 213 MB      | 0–0.2%     | 270 MB, 2% |
  | windows-latest | 183 MB      | 0.2%       | 230 MB, 2% |
  | macos-latest   | 199 MB      | 0.2–0.4%   | 250 MB, 2% |

- **Active use (#109).** A third benchmark (`bench/activity.spec.ts`) runs
  fifteen rounds of everyday use on two accounts: showing each account,
  a notification from each, and opening and closing Settings. Over three
  launches it takes the median of two numbers:
  - **Memory growth:** what all of YapYap's processes hold more after the
    rounds than before, both once settled. It levels off: on Linux, 45
    rounds grew no more than 15, so a budget near twice the median still
    catches a leak of about 1.5 MB a round.
  - **Main-process CPU:** the main process's share of one core while the
    rounds run, which is mostly opening windows and rebuilding menus.

  Calibrated on 2026-10-25:

  | Runner         | Growth   | Main CPU | Budget     |
  | -------------- | -------- | -------- | ---------- |
  | ubuntu-latest  | 17 MB    | 46–48%   | 40 MB, 70% |
  | windows-latest | 8–20 MB  | 42–45%   | 40 MB, 70% |
  | macos-latest   | 15–22 MB | 42–45%   | 40 MB, 70% |

- **Memory review (#496, 2026-11-01).** A survey measured, on the fake page
  under Xvfb on Linux, each process's working set, its proportional set
  size (PSS, which shares each shared page among the processes using it)
  and its private memory, in five states: one account, after opening and
  closing Settings, About, Extensions and Downloads, two accounts, with the
  example and call-recorder extensions, and hidden in the tray. Each figure is
  the mean of three launches before the changes below and two after:

  | State                | Processes | Working set (MB) | PSS (MB)  | Private (MB) |
  | -------------------- | --------- | ---------------- | --------- | ------------ |
  | One account          | 5 → 4     | 648 → 570        | 266 → 253 | 161 → 156    |
  | After chrome windows | 5 → 4     | 653 → 576        | 269 → 257 | 164 → 159    |
  | Two accounts         | 7 → 6     | 894 → 816        | 297 → 285 | 163 → 154    |
  | With two extensions  | 9 → 8     | 1115 → 1039      | 326 → 315 | 189 → 181    |
  | Hidden in the tray   | 9 → 8     | 1120 → 1044      | 325 → 315 | 187 → 178    |

  What changed:
  - The main window is a `BaseWindow` (ADR 0001 already described it so),
    not a `BrowserWindow`. Its own page stayed empty, since WhatsApp and the
    sidebar run in views, but Chromium still ran a renderer for it: about
    76 MB of working set and 15 MB of PSS for nothing.
  - electron-updater loads only in builds that update themselves. Distro,
    Flatpak and development builds no longer hold its 4 MB of JavaScript
    heap; the main process's heap fell from 15 to 13 MB.
  - The startup benchmark also counts renderer processes once settled,
    with a budget of one (WhatsApp's) on every OS. The count is exact, so
    a window created ahead of time, one left running after it closes, or
    another empty page fails it at once, whatever the runner's noise.
  - The idle-memory budgets now sit 10% above the medians of this change's
    own benchmark run, as in #428, so the saving cannot quietly return:

    | Runner         | Idle memory before | Idle memory after | Budget |
    | -------------- | ------------------ | ----------------- | ------ |
    | ubuntu-latest  | 651 MB             | 570 MB            | 630 MB |
    | windows-latest | 399 MB             | 338 MB            | 375 MB |
    | macos-latest   | 489 MB             | 428 MB            | 470 MB |

  What was checked and left as it is:
  - Chrome windows (`app://chrome/`) are created on demand and destroyed on
    close: memory returns to where it was once they close, and the sidebar
    loads only once a second account exists.
  - Chromium switches: disabling `HardwareMediaKeyHandling`,
    `MediaSessionService` and `SpareRendererForSitePerProcess` saved 2–4 MB,
    within run-to-run noise, and the first would take media keys away from
    voice messages. Running the network service in the browser process, or
    turning off the GPU process, would weaken the sandbox or calls.
    Lowering V8's heap is already a setting (`reliability.jsHeapMb`).
  - Hidden accounts are not discarded or suspended: WhatsApp's own scripts
    raise its notifications (ADR 0011), so a hidden account must keep
    running. Chromium already throttles it while hidden (0.2% of a core,
    above), unless the user turned off `privacy.unreadWhileHidden`.
  - Each idle extension holds a renderer (about 107 MB of working set, 22 MB
    of PSS). Starting extensions only when needed would need activation
    events in the manifest (ADR 0004), since extensions add their commands
    and listen for calls from `activate`; that is a change to the extension
    model, not a safe tweak (#495).
  - No timer or map in the main process grows without bound: per-page
    timers stop when their page is destroyed, and the 15 rounds of
    `activity.spec.ts` level off as before.

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
  when the fake page grows.
