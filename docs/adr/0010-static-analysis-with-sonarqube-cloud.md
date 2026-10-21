# 0010. Static analysis with SonarQube Cloud

- Status: Accepted
- Date: 2026-10-21

## Context

ESLint, CodeQL, Stryker and the 100% coverage gate (ADR 0005) each check one
thing. The maintainer wants one more layer on top of them: SonarQube Cloud,
with the strictest quality gate the project can keep green, and zero open
issues on both new and overall code (#185).

SonarQube Cloud's automatic analysis cannot import coverage reports, so the
analysis must run in CI.

## Decision

- **Where it runs:** the `SonarQube Cloud` job in `ci.yml`, on every pull
  request and every push to `master`. It runs `pnpm test:coverage`, then the
  official scan action pinned by commit SHA, and waits for the quality gate.
  Automatic analysis is turned off for the project. Without `SONAR_TOKEN`
  (forks, Dependabot) the job skips the analysis with a notice.
- **Scope:** `sonar-project.properties`. Test code (unit tests, E2E specs, the
  fake WhatsApp page) is analyzed with test rules and kept out of duplication
  and coverage. Coverage exclusions mirror `vitest.config.ts`, so Sonar and
  Vitest agree on 100%.
- **Quality gate "YapYap strict"** (assigned to this project only; the
  organization default stays as it is):
  - New code: coverage 100%, duplication 0%, A ratings for reliability,
    security, maintainability and security review, every hotspot reviewed,
    no new issues, no accepted issues, and A ratings for dependency
    vulnerabilities, licensing and malware.
  - Overall code: the same conditions, with zero issues instead of zero new
    issues.
- **Quality profiles "YapYap strict"**, for TypeScript, JavaScript, CSS, HTML,
  GitHub Actions, YAML, JSON, XML, secrets and text. Each inherits Sonar way
  comprehensive, so new built-in rules arrive on their own, and also
  activates every other rule of its language except these:

  | Rule                                        | Why it is off                                                                                                                       |
  | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
  | S1537 (no trailing commas)                  | Prettier adds trailing commas (`trailingComma: all`); the two cannot both pass                                                      |
  | S3524 (no parentheses around one parameter) | Prettier always parenthesizes arrow function parameters                                                                             |
  | S1451, Web:HeaderCheck (file headers)       | The license lives in `LICENSE` and package metadata; per-file headers would repeat it hundreds of times                             |
  | S1774 (no ternary operator)                 | Ternaries are the idiomatic way to choose a value in TypeScript and JSX; ESLint already limits nesting                              |
  | S2138 (no `undefined` assignment)           | The codebase uses `undefined` for "absent" everywhere, as TypeScript's optional properties do; `null` is kept for JSON and DOM APIs |
  | S4622 (unions of at most two types)         | String literal unions such as `'system' \| 'light' \| 'dark'` are how the settings schema and IPC types are modelled                |
  | Web:InternationalizationCheck               | The app chrome is localized in TypeScript (#55), not through server-side resource bundles in HTML                                   |
  | text:S7036 (inclusive terminology)          | Every hit is the name of the default branch, `master`; renaming the branch is a separate decision                                   |

  S100 (function names) allows PascalCase as well, because Preact components
  and ESLint rule visitors (`Program`) must use it.

- **Exceptions:** an issue is fixed, or the rule is turned off above with a
  reason. Issues are never accepted, and the gate fails if one is. Marking a
  false positive needs a comment that explains it. Narrow per-file
  exceptions live in `sonar-project.properties`, each with its reason.
- **Required check:** the job becomes required in `.github/rulesets/master.json`
  only once overall code passes the gate, so the backlog does not block
  unrelated work in the meantime.

## Consequences

- Every pull request gets a quality gate result and a decoration with its new
  issues, coverage and duplication.
- The CI job repeats the unit tests to produce coverage next to the scan;
  this costs about a minute and keeps the job self-contained.
- A rule that conflicts with a project convention is turned off with a reason
  here rather than worked around in code.
