import { createHash } from 'node:crypto';
import { en } from '../../shared/messages/en.ts';

/** Present while YapYap runs; still there at the next launch means it did not quit cleanly. */
export const SESSION_MARKER = 'running.json';
/** The latest crash report. Only one is kept; a new crash replaces it. */
export const CRASH_REPORT = 'crash-report.txt';

/** Enough of the previous session's log to show what led up to the crash. */
const LOG_LINES = 40;
const MAX_LINE_LENGTH = 300;
/** GitHub rejects issue links much longer than this. */
const MAX_ISSUE_REPORT = 6000;
const ISSUE_FORM = 'https://github.com/vascoguita/yapyap/issues/new';

export interface Session {
  readonly version: string;
  readonly startedAt: number;
}

export function sessionMarker(session: Session): string {
  return JSON.stringify(session);
}

/** The session a leftover marker describes; anything unreadable describes none. */
export function readSessionMarker(text: string): Session | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const { version, startedAt } = Object(value) as Record<string, unknown>;
  return typeof version === 'string' && Number.isSafeInteger(startedAt) && (startedAt as number) > 0
    ? { version, startedAt: startedAt as number }
    : undefined;
}

function shorten(line: string): string {
  return line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line;
}

/** How many of the last warnings and errors identify a crash. */
const FINGERPRINT_LINES = 5;
const FINGERPRINT_LENGTH = 12;

/**
 * A short, stable name for a crash (#113), so reports of the same crash can
 * be found together. It hashes the previous session's last warnings and
 * errors, without their times and with every number made alike, so it does
 * not change with when the crash happened or with IDs and sizes in messages.
 */
export function crashFingerprint(previousLog: readonly string[]): string {
  const signs = previousLog
    .map((line) => line.split(' ').slice(1).join(' '))
    .filter((line) => line.startsWith('warn ') || line.startsWith('error '))
    .slice(-FINGERPRINT_LINES)
    .map((line) => line.replaceAll(/\d+/g, '#'));
  return createHash('sha256').update(signs.join('\n')).digest('hex').slice(0, FINGERPRINT_LENGTH);
}

/**
 * Plain text the user reviews before sharing anything. It holds the
 * technical details and the end of the previous session's log, which is
 * redacted when written; never memory dumps, which can hold messages.
 */
export function buildCrashReport(
  previous: Session,
  technicalDetails: string,
  previousLog: readonly string[],
): string {
  const log = previousLog.slice(-LOG_LINES).map(shorten);
  return [
    'YapYap closed unexpectedly.',
    `Fingerprint: ${crashFingerprint(previousLog)}`,
    `Previous session: YapYap ${previous.version}, started ${new Date(previous.startedAt).toISOString()}`,
    '',
    technicalDetails,
    '',
    'End of the previous session’s log:',
    ...(log.length === 0 ? ['(empty)'] : log),
  ].join('\n');
}

/** What a bug report starts with; the user edits all of it on GitHub before submitting. */
interface BugReport {
  readonly title: string;
  readonly whatHappened: string;
  readonly diagnostics: string;
}

/** GitHub's bug report form, filled in through the template's field IDs. */
export function bugReportUrl(report: BugReport): string {
  const { diagnostics } = report;
  const url = new URL(ISSUE_FORM);
  url.searchParams.set('template', 'bug_report.yml');
  url.searchParams.set('title', report.title);
  url.searchParams.set('what-happened', report.whatHappened);
  url.searchParams.set(
    'diagnostics',
    diagnostics.length > MAX_ISSUE_REPORT
      ? `${diagnostics.slice(0, MAX_ISSUE_REPORT)}\n[trimmed]`
      : diagnostics,
  );
  return url.toString();
}

/** A new bug report with the crash report filled in, for the user to review and submit. */
export function crashIssueUrl(report: string): string {
  const fingerprint = /^Fingerprint: (\w+)$/m.exec(report)?.[1];
  return bugReportUrl({
    title:
      fingerprint === undefined ? en.report.crashTitle : en.report.crashTitleWith({ fingerprint }),
    whatHappened: en.report.crashWhatHappened,
    diagnostics: report,
  });
}
