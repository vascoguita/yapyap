import { describe, expect, it } from 'vitest';
import {
  buildCrashReport,
  CRASH_REPORT,
  crashIssueUrl,
  readSessionMarker,
  SESSION_MARKER,
  sessionMarker,
} from './crash-report.ts';

const SESSION = { version: '0.1.0', startedAt: Date.UTC(2026, 9, 22, 8, 30) };

describe('session markers', () => {
  it('round-trips the version and start time', () => {
    expect(readSessionMarker(sessionMarker(SESSION))).toEqual(SESSION);
    expect([SESSION_MARKER, CRASH_REPORT]).toEqual(['running.json', 'crash-report.txt']);
  });

  it.each([
    '',
    'not json',
    'null',
    '"0.1.0"',
    '{"version":"0.1.0"}',
    '{"version":1,"startedAt":5}',
    '{"version":"0.1.0","startedAt":"5"}',
    '{"version":"0.1.0","startedAt":0}',
    '{"version":"0.1.0","startedAt":1.5}',
    '{"version":"0.1.0","startedAt":1e300}',
  ])('describes no session for %j', (text) => {
    expect(readSessionMarker(text)).toBeUndefined();
  });
});

describe('buildCrashReport', () => {
  it('holds the session, the technical details and the end of the log', () => {
    expect(buildCrashReport(SESSION, 'YapYap 0.1.0 (deb)\nOS linux', ['one', 'two'])).toBe(
      [
        'YapYap closed unexpectedly.',
        'Previous session: YapYap 0.1.0, started 2026-10-22T08:30:00.000Z',
        '',
        'YapYap 0.1.0 (deb)',
        'OS linux',
        '',
        'End of the previous session’s log:',
        'one',
        'two',
      ].join('\n'),
    );
  });

  it('keeps only the last 40 log lines, each at most 300 characters', () => {
    const log = Array.from({ length: 45 }, (_, index) => `line ${String(index)}`);
    log[44] = 'x'.repeat(301);
    const lines = buildCrashReport(SESSION, 'details', log).split('\n');
    expect(lines.slice(6)).toHaveLength(40);
    expect(lines[6]).toBe('line 5');
    expect(lines.at(-1)).toBe(`${'x'.repeat(300)}…`);
    expect(buildCrashReport(SESSION, 'd', ['y'.repeat(300)]).endsWith(`\n${'y'.repeat(300)}`)).toBe(
      true,
    );
  });

  it('says when the log is empty', () => {
    expect(buildCrashReport(SESSION, 'details', []).endsWith('log:\n(empty)')).toBe(true);
  });
});

describe('crashIssueUrl', () => {
  it('prefills a bug report with the crash report', () => {
    const url = new URL(crashIssueUrl('the report'));
    expect(url.origin + url.pathname).toBe('https://github.com/vascoguita/yapyap/issues/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: 'bug_report.yml',
      title: 'YapYap closed unexpectedly',
      'what-happened': 'YapYap closed unexpectedly. I was …',
      diagnostics: 'the report',
    });
  });

  it('trims a report too long for a link', () => {
    const diagnostics = (report: string) =>
      new URL(crashIssueUrl(report)).searchParams.get('diagnostics');
    expect(diagnostics('a'.repeat(6000))).toBe('a'.repeat(6000));
    expect(diagnostics('a'.repeat(6001))).toBe(`${'a'.repeat(6000)}\n[trimmed]`);
  });
});
