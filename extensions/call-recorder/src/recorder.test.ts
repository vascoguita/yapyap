import { describe, expect, it, vi } from 'vitest';
import { serve, type Port } from './recorder.ts';

const RECORDING = { id: 'b'.repeat(32), started: '2026-10-29T10:00:00.000Z', durationMs: 1000 };

function setup() {
  const commands = new Map<string, () => unknown>();
  const host = {
    calls: {
      record: vi.fn(() => Promise.resolve('recording' as const)),
      stop: vi.fn(() => Promise.resolve()),
      state: vi.fn(() => Promise.resolve({ supported: true, call: true, recordingSince: null })),
      recordings: vi.fn(() => Promise.resolve([RECORDING])),
      reveal: vi.fn(() => Promise.resolve()),
    },
    commands: {
      onRun: (id: string, run: () => unknown) => {
        commands.set(id, run);
      },
    },
  };
  const sent: unknown[] = [];
  const port: Port = {
    postMessage: (message) => sent.push(message),
    onmessage: null,
  };
  serve(host, port);
  const send = (data: unknown): void => {
    port.onmessage?.({ data } as MessageEvent);
  };
  return { host, sent, commands, send };
}

const STATUS = {
  type: 'status',
  supported: true,
  call: true,
  recordingSince: null,
  recordings: [RECORDING],
};

describe('serve', () => {
  it('records and stops from its commands, and tells the panel', async () => {
    const t = setup();
    await t.commands.get('record')?.();
    expect(t.host.calls.record).toHaveBeenCalledOnce();
    expect(t.sent.at(-1)).toEqual(STATUS);
    await t.commands.get('stop')?.();
    expect(t.host.calls.stop).toHaveBeenCalledOnce();
    expect(t.sent).toHaveLength(2);
  });

  it('answers each of the panel’s requests with the status, and ignores anything else', async () => {
    const t = setup();
    t.send({ type: 'status?' });
    await vi.waitFor(() => {
      expect(t.sent).toHaveLength(1);
    });
    t.send({ type: 'record' });
    t.send({ type: 'stop' });
    t.send({ type: 'reveal', id: RECORDING.id });
    t.send({ type: 'delete' });
    await vi.waitFor(() => {
      expect(t.sent).toHaveLength(4);
    });
    expect(t.host.calls.record).toHaveBeenCalledOnce();
    expect(t.host.calls.stop).toHaveBeenCalledOnce();
    expect(t.host.calls.reveal).toHaveBeenCalledExactlyOnceWith(RECORDING.id);
  });

  it('still answers when YapYap refuses a request', async () => {
    const t = setup();
    t.host.calls.reveal.mockRejectedValueOnce(new Error('No such recording.'));
    t.send({ type: 'reveal', id: RECORDING.id });
    await vi.waitFor(() => {
      expect(t.sent).toEqual([STATUS]);
    });
  });
});
