import { describe, expect, it } from 'vitest';
import { stampRelease } from './metainfo.ts';

const EMPTY = '<component>\n  <releases/>\n</component>\n';

describe('stampRelease', () => {
  it('turns an empty releases element into a list with the new release', () => {
    expect(stampRelease(EMPTY, '0.1.0', '2026-10-20')).toBe(
      [
        '<component>',
        '  <releases>',
        '    <release version="0.1.0" date="2026-10-20">',
        '      <url type="details">https://github.com/vascoguita/yapyap/releases/tag/v0.1.0</url>',
        '    </release>',
        '  </releases>',
        '</component>',
        '',
      ].join('\n'),
    );
  });

  it('puts a newer release first and accepts pre-release versions', () => {
    const once = stampRelease(EMPTY, '0.1.0', '2026-10-20');
    const twice = stampRelease(once, '0.2.0-beta.1', '2026-11-02');
    expect(twice.indexOf('0.2.0-beta.1')).toBeLessThan(twice.indexOf('"0.1.0"'));
    expect(twice.match(/<releases>/g)).toHaveLength(1);
  });

  it('accepts multi-digit version parts', () => {
    expect(stampRelease(EMPTY, '10.20.30', '2026-10-20')).toContain('version="10.20.30"');
  });

  it('leaves the file unchanged when the version is already stamped', () => {
    const once = stampRelease(EMPTY, '0.1.0', '2026-10-20');
    expect(stampRelease(once, '0.1.0', '2026-10-21')).toBe(once);
  });

  it.each([
    ['v0.1.0', '2026-10-20', 'Not a release version: v0.1.0'],
    ['0.1', '2026-10-20', 'Not a release version: 0.1'],
    ['0.1.0 ', '2026-10-20', 'Not a release version: 0.1.0 '],
    ['0.1.0', '20-10-2026', 'Not an ISO date: 20-10-2026'],
    ['0.1.0', '2026-10-20T00:00', 'Not an ISO date: 2026-10-20T00:00'],
    ['0.1.0', 'on 2026-10-20', 'Not an ISO date: on 2026-10-20'],
  ])('rejects version %j with date %j', (version, date, message) => {
    expect(() => stampRelease(EMPTY, version, date)).toThrow(message);
  });

  it('refuses metainfo without a releases element', () => {
    expect(() => stampRelease('<component/>', '0.1.0', '2026-10-20')).toThrow(
      'The metainfo has no <releases> element',
    );
  });
});
