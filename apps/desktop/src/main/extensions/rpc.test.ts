import { Type } from 'typebox';
import { describe, expect, it, vi } from 'vitest';
import { RPC_OPTIONS, serveExtensionRpc, tokenBucket, type RpcMethod } from './rpc.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve));

function setup(granted: readonly string[] = ['notifications:show']) {
  let receive: ((event: { data: unknown }) => void) | undefined;
  const port = {
    on: vi.fn((_event: 'message', listener: (event: { data: unknown }) => void) => {
      receive = listener;
    }),
    postMessage: vi.fn(),
    start: vi.fn(),
  };
  const timers: (() => void)[] = [];
  let time = 0;
  const show = vi.fn<RpcMethod['run']>(() => Promise.resolve('shown'));
  const methods: Record<string, RpcMethod> = {
    'notifications.show': {
      capability: 'notifications:show',
      params: Type.Tuple([Type.String({ maxLength: 10 })]),
      run: show,
    },
    'storage.get': {
      capability: 'storage:local',
      params: Type.Tuple([Type.String()]),
      run: () => Promise.resolve(1),
    },
  };
  const audit = vi.fn();
  serveExtensionRpc(
    port,
    (capability) => granted.includes(capability),
    methods,
    {
      rate: { burst: 2, perSecond: 1 },
      timeoutMs: 1000,
      now: () => time,
      after: (_ms, callback) => {
        timers.push(callback);
      },
    },
    audit,
  );
  return {
    port,
    audit,
    show,
    send: async (data: unknown) => {
      receive?.({ data });
      await settle();
    },
    replies: () => port.postMessage.mock.calls.map(([reply]) => reply as unknown),
    expire: () => {
      for (const timer of timers.splice(0)) {
        timer();
      }
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('serveExtensionRpc', () => {
  it('starts the port and answers a granted, well-formed call with its result', async () => {
    const t = setup();
    expect(t.port.start).toHaveBeenCalledOnce();
    await t.send({ id: 1, method: 'notifications.show', params: ['Hi'] });
    expect(t.show).toHaveBeenCalledExactlyOnceWith(['Hi']);
    expect(t.replies()).toEqual([{ id: 1, result: 'shown' }]);
    expect(t.audit).toHaveBeenCalledExactlyOnceWith({
      method: 'notifications.show',
      capability: 'notifications:show',
      outcome: 'ok',
    });
  });

  it('answers nothing to a message without a usable ID', async () => {
    const t = setup();
    for (const data of [
      null,
      'hello',
      { method: 'notifications.show', params: [] },
      { id: 0, method: 'notifications.show', params: [] },
      { id: 1.5, method: 'notifications.show', params: [] },
      { id: 1, method: 'notifications.show', params: [], extra: true },
      { id: 1, method: 'x'.repeat(65), params: [] },
      { id: 1, method: 'notifications.show', params: Array.from({ length: 9 }, () => 'x') },
    ]) {
      await t.send(data);
    }
    expect(t.replies()).toEqual([]);
  });

  it('refuses calls that do not match the API, before anything else', async () => {
    const t = setup([]);
    await t.send({ id: 1, method: 'messages.send', params: ['Hi'] });
    await t.send({ id: 2, method: 'toString', params: [] });
    await t.send({ id: 3, method: 'notifications.show', params: ['far too long'] });
    await t.send({ id: 4, method: 'notifications.show', params: [] });
    const invalid = { kind: 'invalid', message: 'The call does not match the API.' };
    expect(t.replies()).toEqual([1, 2, 3, 4].map((id) => ({ id, error: invalid })));
    expect(t.show).not.toHaveBeenCalled();
    // Names the extension made up are never recorded; calls to offered operations are.
    expect(t.audit.mock.calls).toEqual([
      [{ method: 'notifications.show', capability: 'notifications:show', outcome: 'invalid' }],
      [{ method: 'notifications.show', capability: 'notifications:show', outcome: 'invalid' }],
    ]);
  });

  it('refuses a call the extension holds no capability for', async () => {
    const t = setup();
    await t.send({ id: 7, method: 'storage.get', params: ['key'] });
    expect(t.replies()).toEqual([
      {
        id: 7,
        error: { kind: 'not-granted', message: 'The extension does not hold storage:local.' },
      },
    ]);
    expect(t.audit).toHaveBeenCalledExactlyOnceWith({
      method: 'storage.get',
      capability: 'storage:local',
      outcome: 'not-granted',
    });
  });

  it('limits how often an extension calls, and lets it call again later', async () => {
    const t = setup();
    for (const id of [1, 2, 3]) {
      await t.send({ id, method: 'notifications.show', params: ['Hi'] });
    }
    expect(t.replies().at(-1)).toEqual({
      id: 3,
      error: { kind: 'rate-limited', message: 'The extension is calling too often.' },
    });
    t.advance(1000);
    await t.send({ id: 4, method: 'notifications.show', params: ['Hi'] });
    expect(t.replies().at(-1)).toEqual({ id: 4, result: 'shown' });
  });

  it('gives up on a call that takes too long, and reports one that fails without why', async () => {
    const t = setup();
    t.show.mockReturnValueOnce(new Promise(() => undefined));
    await t.send({ id: 1, method: 'notifications.show', params: ['Hi'] });
    t.expire();
    await settle();
    t.show.mockRejectedValueOnce(new Error('the secret reason'));
    await t.send({ id: 2, method: 'notifications.show', params: ['Hi'] });
    expect(t.replies()).toEqual([
      { id: 1, error: { kind: 'timeout', message: 'The call took too long.' } },
      { id: 2, error: { kind: 'failed', message: 'The call failed.' } },
    ]);
  });

  it('reports a method that throws instead of rejecting as a failure', async () => {
    const t = setup();
    t.show.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await t.send({ id: 1, method: 'notifications.show', params: ['Hi'] });
    expect(t.replies()).toEqual([
      { id: 1, error: { kind: 'failed', message: 'The call failed.' } },
    ]);
  });
});

describe('tokenBucket', () => {
  it('allows a burst, then calls at the refill rate, never saving more than the burst', () => {
    let time = 0;
    const take = tokenBucket({ burst: 2, perSecond: 2 }, () => time);
    expect([take(), take(), take()]).toEqual([true, true, false]);
    time += 500;
    expect([take(), take()]).toEqual([true, false]);
    time += 60_000;
    expect([take(), take(), take()]).toEqual([true, true, false]);
  });

  it('has defaults that allow a burst of calls and a steady rate', () => {
    expect(RPC_OPTIONS).toEqual({ rate: { burst: 20, perSecond: 5 }, timeoutMs: 10_000 });
  });
});
