# 0005. Test strategy

- Status: Accepted
- Date: 2026-10-18

## Context

YapYap wraps a service we must never automate with a real account, runs on
three operating systems and several package formats, and hosts untrusted
code. Tests must be fast enough to run on every PR, strong enough that
coverage numbers mean something, and must never touch real WhatsApp.

## Decision

### Layers

| Layer         | Tool                      | Scope                                                                                                                                                                                                                                                  |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit          | Vitest (node / happy-dom) | All pure logic: settings decoding, URL policy, UA builder, redaction, update policy, adapter parsing, agent token checks                                                                                                                               |
| Integration   | Vitest                    | IPC handlers with a fake Electron surface, protocol handlers, the MCP server                                                                                                                                                                           |
| Property      | Vitest + fast-check       | Parsers and validators of untrusted input (origin overrides, license expressions, versions, settings files, MCP requests)                                                                                                                              |
| E2E           | Playwright `_electron`    | App chrome, multi-account, tray, settings, recovery actions, the assistant, the MCP server, and accessibility (axe)                                                                                                                                    |
| Visual        | Playwright screenshots    | App chrome in light and dark themes, per OS baseline                                                                                                                                                                                                   |
| Mutation      | Stryker (command runner)  | The scope in `scripts/src/mutation/scope.ts`: WhatsApp adapter, chrome IPC plumbing and handlers, settings, the secret store, navigation, permissions, security guards, updates, AI providers, and license and release scripts. Score ≥ 90%, enforced. |
| Package smoke | CI per artifact           | Install, launch, window opens, fake WhatsApp loads                                                                                                                                                                                                     |
| Benchmarks    | Nightly                   | Cold start and idle memory per account against budgets                                                                                                                                                                                                 |

### Fake WhatsApp

`apps/desktop/test/fake-whatsapp/` is a local static site that reproduces the
DOM landmarks the adapter relies on. It is built from **anonymized
HTML fixtures**: names, numbers, avatars and message text are replaced by
synthetic values, and a fixture linter (`src/adapter/fixtures.test.ts`)
rejects anything that looks like a phone number or a remote profile image.
The only phone numbers allowed are in Ofcom's range reserved for fiction,
+44 7700 900000 to 900999, which no one can own. It also has scripted states
(logged-out QR, chat list, unread, "update your browser", offline). The real
WhatsApp origin is never loaded in tests.

The WhatsApp origin can be overridden only with
`YAPYAP_TEST_WHATSAPP_ORIGIN`, and only to a loopback `http://127.0.0.1:<port>`
or `http://localhost:<port>` origin. Any other value is ignored and logged.
This lets packaged builds be smoke-tested without opening an
attacker-controlled redirect.

### Coverage

- 100% lines, branches, functions and statements on all code we own, using
  V8 coverage merged across unit and integration runs. CI fails below 100%.
- `istanbul ignore`, `c8 ignore` and `v8 ignore` comments are forbidden by an
  ESLint rule and a CI grep.
- Files excluded from coverage are listed in `vitest.config.ts` and justified
  here, and nowhere else:

  | Excluded                              | Why                                                                                                                               |
  | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | `apps/desktop/src/main/index.ts`      | Process entry: wires real Electron modules into tested factories. Only runnable inside Electron, and exercised by every E2E test. |
  | `apps/desktop/src/preload/*/index.ts` | `contextBridge.exposeInMainWorld` calls. Each only binds an already unit-tested API object, and exercised by E2E.                 |
  | `scripts/src/bin/**`                  | Command entry points that only read `process.env` and pass real `fetch` and `fs` into tested modules; branch-free by lint rule.   |
  | `**/*.d.ts`                           | No executable code                                                                                                                |
  | `**/*.test.ts`, `**/*.test.tsx`       | Tests. Test helpers, E2E specs and config files lie outside the covered `src` folders anyway.                                     |

The rule for entry files: they may only import factories and call them with
real dependencies. They contain no branches. A lint rule (`complexity: 1`
for these paths) enforces it.

### Untrusted callers

The MCP server is the one door into YapYap from other programs (ADR 0019).
`apps/desktop/src/main/agents/request-checks.test.ts` asserts that a
request from another computer, with a rebound host, or of the wrong method,
path, type or size is refused, and, with fast-check, that no request naming
an origin gets through. `apps/desktop/e2e/agents.spec.ts` checks the
scopes and chat lists of real tokens end to end.

### Platforms

Unit, integration and E2E run on `ubuntu-latest`, `windows-latest` and
`macos-latest`; a pull request runs macOS only when its change can affect
it (ADR 0007, #657). Linux E2E runs under `xvfb-run`, which developers also use
locally when available. Visual baselines are per-OS.

### Mutation testing

Stryker uses its `command` runner. Each mutant runs `vitest run --config vitest.mutation.config.ts`, a flat single-project config, and the mutant is switched on through the environment. The Vitest runner extension does not activate mutants under Vitest 5 (ADR 0008, C12). The scope lives in `scripts/src/mutation/scope.ts`, which both Stryker and the PR target selection use. On PRs, Stryker mutates only changed files within the mutation scope
(`--mutate` from the diff), in one job per five changed modules so that a
change touching most modules, such as a rename, stays within a runner's time
limit (#657); a change with no in-scope module starts no job, and a shard
with nothing left to mutate stops before installing. Nightly runs the full scope
in 16 shards (`git ls-files | mutation-targets.ts --shard i/16` deals the sorted
modules out in turn), each mutating its modules and running only their
related tests, as PRs do;
one run over everything with the whole suite per mutant took more than a
runner's two hours. The threshold is `break: 90`, for each shard.

Stryker already runs one suite per CPU, so the mutation config gives each suite
a single Vitest worker, and its setup file stops fast-check at the first failure
without shrinking. Without either, killed mutants are reported as timeouts.

### Property-based tests

Code that parses untrusted or external input also gets property-based tests in
`*.property.test.ts` files, using fast-check. A property states an invariant
(for example, "the resolved origin is WhatsApp or loopback HTTP") or compares
the code with a simple reference model, and fast-check searches for
counterexamples. They run with the unit tests, and they also count as fuzzing
for the OpenSSF Scorecard.

## Amendments

- 2026-11-16 (#641): dropped the capability checker, signature checks,
  extension host and installer, the malicious-extension suite and the
  `packages/*/src/bin` coverage row, all gone with extensions (ADR 0018),
  and matched the mutation scope and coverage exclusions to the code.

## Consequences

- Electron-only code must be thin wrappers around injectable, tested logic.
  This shapes the architecture toward dependency injection.
- The fake WhatsApp needs maintenance whenever the adapter's selectors change.
  That is intentional: it is the adapter's executable specification.
