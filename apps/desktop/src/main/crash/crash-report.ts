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
    `Previous session: YapYap ${previous.version}, started ${new Date(previous.startedAt).toISOString()}`,
    '',
    technicalDetails,
    '',
    'End of the previous session’s log:',
    ...(log.length === 0 ? ['(empty)'] : log),
  ].join('\n');
}

/** A new bug report with the crash report filled in, for the user to review and submit. */
export function crashIssueUrl(report: string): string {
  const diagnostics =
    report.length > MAX_ISSUE_REPORT ? `${report.slice(0, MAX_ISSUE_REPORT)}\n[trimmed]` : report;
  const url = new URL(ISSUE_FORM);
  url.searchParams.set('template', 'bug_report.yml');
  url.searchParams.set('title', 'YapYap closed unexpectedly');
  url.searchParams.set('what-happened', 'YapYap closed unexpectedly. I was …');
  url.searchParams.set('diagnostics', diagnostics);
  return url.toString();
}
