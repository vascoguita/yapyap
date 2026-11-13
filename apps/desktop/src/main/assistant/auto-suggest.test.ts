import { describe, expect, it, vi } from 'vitest';
import { followOpenChat, LOOK_EVERY_MS } from './auto-suggest.ts';

/** A page whose probe answers with what `answer` says now. */
function fakePage(first: unknown) {
  let answer: unknown = first;
  return {
    executeJavaScriptInIsolatedWorld: vi.fn(() =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
    ),
    set: (next: unknown) => {
      answer = next;
    },
  };
}

function setup(first: unknown = 'aaaaaaaa:00000001:-:i') {
  let page = fakePage(first);
  let active = true;
  let tick = (): void => undefined;
  const deps = {
    activePage: () => page,
    active: () => active,
    opened: vi.fn(),
    arrived: vi.fn(),
    sent: vi.fn(),
    every: vi.fn((callback: () => void) => {
      tick = callback;
    }),
  };
  followOpenChat(deps);
  return {
    deps,
    page: () => page,
    switchPage: (next: ReturnType<typeof fakePage>) => {
      page = next;
    },
    setActive: (value: boolean) => {
      active = value;
    },
    look: async () => {
      page.executeJavaScriptInIsolatedWorld.mockClear();
      tick();
      await vi.waitFor(() => {
        expect(page.executeJavaScriptInIsolatedWorld).toHaveBeenCalled();
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe('followOpenChat', () => {
  it('looks every second and a half, and tells when a message arrives in the same chat', async () => {
    const t = setup();
    expect(t.deps.every).toHaveBeenCalledWith(expect.any(Function), LOOK_EVERY_MS);
    await t.look();
    expect(t.deps.opened).toHaveBeenCalledWith('aaaaaaaa:00000001');
    await t.look();
    expect(t.deps.arrived).not.toHaveBeenCalled();
    t.page().set('aaaaaaaa:00000002:-:i');
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000002');
    expect(t.deps.opened).toHaveBeenCalledOnce();
    expect(t.deps.sent).not.toHaveBeenCalled();
  });

  it('tells when the user sends a message, and asks nothing of a chat whose last message is theirs', async () => {
    const t = setup('aaaaaaaa:00000001:-:i');
    await t.look();
    t.page().set('aaaaaaaa:00000001:0000000f:o');
    await t.look();
    expect(t.deps.sent).toHaveBeenCalledOnce();
    t.page().set('aaaaaaaa:00000001:0000000e:o');
    await t.look();
    expect(t.deps.sent).toHaveBeenCalledTimes(2);
    expect(t.deps.arrived).not.toHaveBeenCalled();
    // A message that arrived but is not the last, as when the user answered at once, asks nothing.
    t.page().set('aaaaaaaa:00000002:0000000d:o');
    await t.look();
    expect(t.deps.arrived).not.toHaveBeenCalled();
  });

  it('tells another chat or account opened, naming its message only when it is theirs and last', async () => {
    const t = setup();
    await t.look();
    t.page().set('bbbbbbbb:-:00000003:o');
    await t.look();
    expect(t.deps.opened).toHaveBeenLastCalledWith(null);
    t.page().set(null);
    await t.look();
    expect(t.deps.opened).toHaveBeenCalledTimes(3);
    await t.look();
    expect(t.deps.opened).toHaveBeenCalledTimes(3);
    const other = fakePage('bbbbbbbb:00000005:-:i');
    t.switchPage(other);
    await t.look();
    expect(t.deps.opened).toHaveBeenLastCalledWith('bbbbbbbb:00000005');
    t.page().set('bbbbbbbb:-:-:-');
    await t.look();
    expect(t.deps.arrived).not.toHaveBeenCalled();
    expect(t.deps.sent).not.toHaveBeenCalled();
  });

  it('does not look while it may not, and tells what changed meanwhile once it may', async () => {
    const t = setup();
    await t.look();
    t.setActive(false);
    t.page().set('aaaaaaaa:00000002:-:i');
    t.page().executeJavaScriptInIsolatedWorld.mockClear();
    t.deps.every.mock.calls[0]?.[0]();
    expect(t.page().executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    t.setActive(true);
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000002');
  });

  it('tells nothing when the page answered nonsense or failed', async () => {
    const t = setup();
    await t.look();
    t.page().set('nonsense');
    await t.look();
    t.page().set(new Error('loading'));
    await t.look();
    expect(t.deps.opened).toHaveBeenCalledOnce();
    expect(t.deps.arrived).not.toHaveBeenCalled();
  });

  it('looks once at a time', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const t = setup();
    t.page().executeJavaScriptInIsolatedWorld.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const tick = t.deps.every.mock.calls[0]?.[0];
    tick?.();
    tick?.();
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce();
    finish('aaaaaaaa:00000001:-:i');
    // Once that look ends, the next tick looks again.
    await vi.waitFor(() => {
      tick?.();
      expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
    });
  });
});
