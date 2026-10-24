import { describe, expect, it } from 'vitest';
import {
  buildCrashReport,
  CRASH_REPORT,
  crashFingerprint,
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
        `Fingerprint: ${crashFingerprint(['one', 'two'])}`,
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
    expect(lines.slice(7)).toHaveLength(40);
    expect(lines[7]).toBe('line 5');
    expect(lines.at(-1)).toBe(`${'x'.repeat(300)}…`);
    expect(buildCrashReport(SESSION, 'd', ['y'.repeat(300)]).endsWith(`\n${'y'.repeat(300)}`)).toBe(
      true,
    );
  });

  it('says when the log is empty', () => {
    expect(buildCrashReport(SESSION, 'details', []).endsWith('log:\n(empty)')).toBe(true);
  });
});

describe('crashFingerprint', () => {
  const at = (time: string, rest: string) => `2026-10-22T${time}.000Z ${rest}`;

  it('stays the same for the same warnings and errors, whenever they happened', () => {
    const first = [
      at('08:00:00', 'info Started'),
      at('08:00:01', 'warn Renderer 4242 used 2100 MB'),
      at('08:00:02', 'error GPU process exited with code 139'),
    ];
    const again = [
      at('09:30:00', 'warn Renderer 7 used 3000 MB'),
      at('09:30:05', 'info Something else'),
      at('09:30:06', 'error GPU process exited with code 11'),
    ];
    expect(crashFingerprint(first)).toMatch(/^[0-9a-f]{12}$/);
    expect(crashFingerprint(again)).toBe(crashFingerprint(first));
  });

  it('differs for different errors, and looks only at the last five', () => {
    const base = [at('08:00:00', 'error Could not load WhatsApp')];
    expect(crashFingerprint(base)).not.toBe(
      crashFingerprint([at('08:00:00', 'error Out of memory')]),
    );
    const noise = Array.from({ length: 5 }, () => at('08:00:01', 'warn Same'));
    expect(crashFingerprint([...base, ...noise])).toBe(crashFingerprint(noise));
    expect(crashFingerprint([])).toBe(crashFingerprint([at('08:00:00', 'info Only info')]));
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

  it('names the crash by its fingerprint in the title, when the report has one', () => {
    const url = new URL(crashIssueUrl('YapYap closed unexpectedly.\nFingerprint: 0a1b2c3d4e5f\n'));
    expect(url.searchParams.get('title')).toBe('YapYap closed unexpectedly (crash 0a1b2c3d4e5f)');
  });

  it('trims a report too long for a link', () => {
    const diagnostics = (report: string) =>
      new URL(crashIssueUrl(report)).searchParams.get('diagnostics');
    expect(diagnostics('a'.repeat(6000))).toBe('a'.repeat(6000));
    expect(diagnostics('a'.repeat(6001))).toBe(`${'a'.repeat(6000)}\n[trimmed]`);
  });
});
