import { describe, expect, it, vi } from 'vitest';
import { followOpenChat, GIVE_UP_AFTER, LOOK_EVERY_MS } from './auto-suggest.ts';

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

function setup(first: unknown = 'aaaaaaaa:00000001:-:i:e:-:-') {
  let page = fakePage(first);
  let enabled = true;
  let onScreen = true;
  let tick = (): void => undefined;
  const deps = {
    activePage: () => page,
    enabled: () => enabled,
    onScreen: () => onScreen,
    found: vi.fn(),
    opened: vi.fn(),
    arrived: vi.fn(),
    sent: vi.fn(),
    cleared: vi.fn(),
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
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    setOnScreen: (value: boolean) => {
      onScreen = value;
    },
    /** Ticks, and tells whether that looked at the page. */
    looked: () => {
      page.executeJavaScriptInIsolatedWorld.mockClear();
      tick();
      return page.executeJavaScriptInIsolatedWorld.mock.calls.length > 0;
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
    // The first look only finds the chat.
    expect(t.deps.found).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000001:-:-');
    await t.look();
    expect(t.deps.arrived).not.toHaveBeenCalled();
    t.page().set('aaaaaaaa:00000002:-:i:e:-:-');
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000002:-:-');
    expect(t.deps.opened).not.toHaveBeenCalled();
    expect(t.deps.sent).not.toHaveBeenCalled();
  });

  it('tells when the chat’s last item is edited, which keeps its ID, as another last item (#739)', async () => {
    const t = setup('aaaaaaaa:00000001:-:i:e:11111111:-');
    await t.look();
    expect(t.deps.found).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000001:11111111:-');
    t.page().set('aaaaaaaa:00000001:-:i:e:22222222:-');
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000001:22222222:-');
    // The user's own last message, edited, is no send.
    t.page().set('aaaaaaaa:00000001:00000009:o:e:33333333:-');
    await t.look();
    t.page().set('aaaaaaaa:00000001:00000009:o:e:44444444:-');
    await t.look();
    expect(t.deps.sent).toHaveBeenCalledOnce();
    expect(t.deps.arrived).toHaveBeenLastCalledWith('aaaaaaaa:00000009:44444444:-');
    expect(t.deps.arrived).toHaveBeenCalledTimes(3);
  });

  it('tells when the user chooses a message to reply to, or removes it, as what to answer (#740)', async () => {
    const t = setup('aaaaaaaa:00000001:-:i:e:11111111:-');
    await t.look();
    t.page().set('aaaaaaaa:00000001:-:i:e:11111111:cccccccc');
    await t.look();
    expect(t.deps.arrived).toHaveBeenLastCalledWith('aaaaaaaa:00000001:11111111:cccccccc');
    // Looking on, the same quote tells nothing more.
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledOnce();
    t.page().set('aaaaaaaa:00000001:-:i:e:11111111:dddddddd');
    await t.look();
    expect(t.deps.arrived).toHaveBeenLastCalledWith('aaaaaaaa:00000001:11111111:dddddddd');
    // Removing the quote names the chat's last item again, as it was.
    t.page().set('aaaaaaaa:00000001:-:i:e:11111111:-');
    await t.look();
    expect(t.deps.arrived).toHaveBeenLastCalledWith('aaaaaaaa:00000001:11111111:-');
    expect(t.deps.arrived).toHaveBeenCalledTimes(3);
    expect(t.deps.sent).not.toHaveBeenCalled();
    expect(t.deps.opened).not.toHaveBeenCalled();
  });

  it('tells when the user sends a message, then that it is the chat’s last item (#723)', async () => {
    const t = setup('aaaaaaaa:00000001:-:i:e:-:-');
    await t.look();
    t.page().set('aaaaaaaa:00000001:0000000f:o:e:-:-');
    await t.look();
    expect(t.deps.sent).toHaveBeenCalledOnce();
    expect(t.deps.arrived).toHaveBeenLastCalledWith('aaaaaaaa:0000000f:-:-');
    expect(t.deps.sent.mock.invocationCallOrder[0]).toBeLessThan(
      t.deps.arrived.mock.invocationCallOrder[0] ?? 0,
    );
    t.page().set('aaaaaaaa:00000001:0000000e:o:e:-:-');
    await t.look();
    expect(t.deps.sent).toHaveBeenCalledTimes(2);
    expect(t.deps.arrived).toHaveBeenLastCalledWith('aaaaaaaa:0000000e:-:-');
    // A message that arrived but is not the last, as when the user answered at once, is no new last item.
    t.page().set('aaaaaaaa:00000002:0000000e:o:e:-:-');
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledTimes(2);
    // Nothing new: no new last item.
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledTimes(2);
  });

  it('takes the user’s older messages drawn after the chat opened for no send (#743)', async () => {
    // WhatsApp drew someone else's last message first, then the user's older ones above it.
    const t = setup('aaaaaaaa:00000001:-:i:e:-:-');
    await t.look();
    t.page().set('aaaaaaaa:00000001:0000000f:i:e:-:-');
    await t.look();
    expect(t.deps.sent).not.toHaveBeenCalled();
    expect(t.deps.arrived).not.toHaveBeenCalled();
    expect(t.deps.cleared).toHaveBeenCalledOnce();
  });

  it('tells at every look that the message box is empty, but not when the user just sent what was in it', async () => {
    const t = setup('aaaaaaaa:00000001:-:i:d:-:-');
    await t.look();
    await t.look();
    expect(t.deps.cleared).not.toHaveBeenCalled();
    t.page().set('aaaaaaaa:00000001:-:i:e:-:-');
    await t.look();
    await t.look();
    expect(t.deps.cleared).toHaveBeenCalledTimes(2);
    // Sending empties the box too, which is a send, not a clear.
    t.page().set('aaaaaaaa:00000001:0000000f:o:e:-:-');
    await t.look();
    expect(t.deps.sent).toHaveBeenCalledOnce();
    expect(t.deps.cleared).toHaveBeenCalledTimes(2);
  });

  it('tells another chat or account opened, naming its last item, whoever’s it is (#723)', async () => {
    const t = setup();
    await t.look();
    t.page().set('bbbbbbbb:-:00000003:o:e:-:-');
    await t.look();
    expect(t.deps.opened).toHaveBeenLastCalledWith('bbbbbbbb:00000003:-:-');
    t.page().set(null);
    await t.look();
    expect(t.deps.opened).toHaveBeenLastCalledWith(null);
    await t.look();
    expect(t.deps.opened).toHaveBeenCalledTimes(2);
    const other = fakePage('bbbbbbbb:00000005:-:i:e:-:-');
    t.switchPage(other);
    await t.look();
    expect(t.deps.opened).toHaveBeenLastCalledWith('bbbbbbbb:00000005:-:-');
    // A chat with nothing in it yet still has suggestions, to start it.
    t.page().set('cccccccc:-:-:-:e:-:-');
    await t.look();
    expect(t.deps.opened).toHaveBeenLastCalledWith('cccccccc:-:-:-');
    expect(t.deps.arrived).not.toHaveBeenCalled();
    expect(t.deps.sent).not.toHaveBeenCalled();
  });

  it('does not look off screen once it has looked, and tells what changed meanwhile once on screen', async () => {
    const t = setup();
    await t.look();
    t.setOnScreen(false);
    t.page().set('aaaaaaaa:00000002:-:i:e:-:-');
    expect(t.looked()).toBe(false);
    t.setOnScreen(true);
    await t.look();
    expect(t.deps.arrived).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000002:-:-');
  });

  it('takes its first look off screen, so a chat the user is in when the window gets focus is not new', async () => {
    const t = setup();
    t.setOnScreen(false);
    await t.look();
    expect(t.deps.found).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000001:-:-');
    expect(t.looked()).toBe(false);
    t.setOnScreen(true);
    await t.look();
    expect(t.deps.found).toHaveBeenCalledOnce();
    expect(t.deps.opened).not.toHaveBeenCalled();
  });

  it('keeps trying for its first look off screen while the page cannot answer', async () => {
    const t = setup(new Error('loading'));
    t.setOnScreen(false);
    await t.look();
    t.page().set('aaaaaaaa:00000001:-:i:e:-:-');
    await t.look();
    expect(t.deps.found).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000001:-:-');
  });

  it('looks at no chat while the assistant is off, on screen or not', () => {
    const t = setup();
    t.setEnabled(false);
    expect(t.looked()).toBe(false);
    t.setOnScreen(false);
    expect(t.looked()).toBe(false);
  });

  it('tells nothing when the page answered nonsense or failed', async () => {
    const t = setup();
    await t.look();
    t.page().set('nonsense');
    await t.look();
    t.page().set(new Error('loading'));
    await t.look();
    expect(t.deps.found).toHaveBeenCalledOnce();
    expect(t.deps.opened).not.toHaveBeenCalled();
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
    finish('aaaaaaaa:00000001:-:i:e:-:-');
    // Once that look ends, the next tick looks again.
    await vi.waitFor(() => {
      tick?.();
      expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
    });
  });

  it('gives up on a look the page never answers, and ignores its answer if it comes late', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const t = setup();
    t.page().executeJavaScriptInIsolatedWorld.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    expect(t.looked()).toBe(true);
    for (let turn = 1; turn <= GIVE_UP_AFTER; turn += 1) {
      expect(t.looked()).toBe(false);
    }
    await t.look();
    expect(t.deps.found).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000001:-:-');
    // The stuck look's answer, a chat that is no longer open, comes in too late to count.
    finish('bbbbbbbb:00000002:-:i:e:-:-');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.deps.opened).not.toHaveBeenCalled();
    expect(t.looked()).toBe(true);
  });

  it('keeps looking once at a time after the stuck look ends late', async () => {
    let finish: (value: unknown) => void = () => undefined;
    let finishNext: (value: unknown) => void = () => undefined;
    const t = setup();
    t.page()
      .executeJavaScriptInIsolatedWorld.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishNext = resolve;
          }),
      );
    t.looked();
    for (let turn = 1; turn <= GIVE_UP_AFTER; turn += 1) {
      t.looked();
    }
    expect(t.looked()).toBe(true);
    // The first look ending must not let a third start while the second still waits.
    finish('aaaaaaaa:00000001:-:i:e:-:-');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.looked()).toBe(false);
    finishNext('aaaaaaaa:00000001:-:i:e:-:-');
    await vi.waitFor(() => {
      expect(t.deps.found).toHaveBeenCalledExactlyOnceWith('aaaaaaaa:00000001:-:-');
    });
    expect(t.looked()).toBe(true);
  });
});
