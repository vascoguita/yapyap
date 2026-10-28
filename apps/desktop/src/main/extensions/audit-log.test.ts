import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditFileAt, createAuditLog, MAX_LOG_BYTES } from './audit-log.ts';

const CALL = {
  extension: 'org.example.hello',
  capability: 'notifications:show',
  method: 'notifications.show',
  outcome: 'ok',
} as const;

let folder = '';

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'yapyap-audit-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('createAuditLog', () => {
  it('records each call with its time, and shows the latest first', () => {
    let time = 0;
    const log = createAuditLog(
      auditFileAt(join(folder, 'audit.log')),
      () => new Date((time += 1000)),
      vi.fn(),
    );
    expect(log.recent()).toEqual([]);
    log.record(CALL);
    log.record({ ...CALL, outcome: 'not-granted' });
    expect(log.recent()).toEqual([
      { time: '1970-01-01T00:00:02.000Z', ...CALL, outcome: 'not-granted' },
      { time: '1970-01-01T00:00:01.000Z', ...CALL },
    ]);
  });

  it('shows at most the last fifty calls, and skips lines it does not understand', () => {
    const path = join(folder, 'audit.log');
    writeFileSync(path, 'not json\n{"time":"t","extension":"p"}\n');
    const log = createAuditLog(auditFileAt(path), () => new Date(0), vi.fn());
    for (let index = 0; index < 60; index += 1) {
      log.record({ ...CALL, method: `m${String(index)}` });
    }
    const recent = log.recent();
    expect(recent).toHaveLength(50);
    expect(recent[0]?.method).toBe('m59');
    expect(recent.at(-1)?.method).toBe('m10');
  });

  it('starts a new file once the log is full, keeping the previous one aside', () => {
    const path = join(folder, 'audit.log');
    writeFileSync(path, `${'x'.repeat(MAX_LOG_BYTES + 1)}\n`);
    const log = createAuditLog(auditFileAt(path), () => new Date(0), vi.fn());
    log.record(CALL);
    expect(log.recent()).toHaveLength(1);
    expect(auditFileAt(`${path}.1`).size()).toBeGreaterThan(MAX_LOG_BYTES);
  });

  it('says when it cannot write, and goes on', () => {
    const warn = vi.fn();
    // A folder where the log should be cannot be appended to.
    const log = createAuditLog(auditFileAt(folder), () => new Date(0), warn);
    expect(() => {
      log.record(CALL);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledExactlyOnceWith('Could not write the extension activity log.');
    expect(log.recent()).toEqual([]);
  });

  it('shows only entries of the exact shape it writes, with every outcome a call can have', () => {
    const path = join(folder, 'audit.log');
    const entry = (fields: object) => JSON.stringify({ time: 't', ...CALL, ...fields });
    const outcomes = ['ok', 'invalid', 'not-granted', 'rate-limited', 'timeout', 'failed'];
    writeFileSync(
      path,
      [
        ...outcomes.map((outcome) => entry({ outcome })),
        entry({ outcome: 'sent' }),
        entry({ extra: 'chat text' }),
        entry({ time: 'x'.repeat(41) }),
        entry({ extension: 'x'.repeat(129) }),
        entry({ capability: 'x'.repeat(65) }),
        entry({ method: 'x'.repeat(65) }),
        entry({ time: 'x'.repeat(40), extension: 'x'.repeat(128), capability: 'x'.repeat(64) }),
      ].join('\n'),
    );
    const log = createAuditLog(auditFileAt(path), () => new Date(0), vi.fn());
    expect(log.recent().map(({ outcome }) => outcome)).toEqual(['ok', ...outcomes.toReversed()]);
  });

  it('keeps writing to a log exactly at its limit, and only moves aside one past it', () => {
    const path = join(folder, 'audit.log');
    writeFileSync(path, 'x'.repeat(MAX_LOG_BYTES));
    createAuditLog(auditFileAt(path), () => new Date(0), vi.fn()).record(CALL);
    expect(auditFileAt(`${path}.1`).size()).toBe(0);
    expect(auditFileAt(path).size()).toBeGreaterThan(MAX_LOG_BYTES);
  });
});

describe('auditFileAt', () => {
  it('reads nothing from a missing log', () => {
    expect(auditFileAt(join(folder, 'missing.log')).read()).toBe('');
  });

  it.skipIf(process.platform === 'win32')('keeps the log readable by the user alone', () => {
    const path = join(folder, 'audit.log');
    auditFileAt(path).append('line\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
