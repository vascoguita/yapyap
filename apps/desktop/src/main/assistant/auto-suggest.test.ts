import { describe, expect, it, vi } from 'vitest';
import { LOOK_EVERY_MS, suggestAsMessagesArrive } from './auto-suggest.ts';

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

function setup(first: unknown = 'aaaaaaaa:00000001') {
  let page = fakePage(first);
  let active = true;
  let tick = (): void => undefined;
  const deps = {
    activePage: () => page,
    active: () => active,
    suggest: vi.fn(),
    every: vi.fn((callback: () => void) => {
      tick = callback;
    }),
  };
  suggestAsMessagesArrive(deps);
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
      tick();
      await vi.waitFor(() => {
        expect(page.executeJavaScriptInIsolatedWorld).toHaveBeenCalled();
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe('suggestAsMessagesArrive', () => {
  it('looks every second and a half, and suggests when a message arrives in the same chat', async () => {
    const t = setup();
    expect(t.deps.every).toHaveBeenCalledWith(expect.any(Function), LOOK_EVERY_MS);
    await t.look();
    expect(t.deps.suggest).not.toHaveBeenCalled();
    await t.look();
    expect(t.deps.suggest).not.toHaveBeenCalled();
    t.page().set('aaaaaaaa:00000002');
    await t.look();
    expect(t.deps.suggest).toHaveBeenCalledOnce();
  });

  it('only notes what is there on opening another chat or account, or when no one else wrote', async () => {
    const t = setup();
    await t.look();
    t.page().set('bbbbbbbb:00000003');
    await t.look();
    t.page().set(null);
    await t.look();
    t.page().set('bbbbbbbb:00000004');
    await t.look();
    const other = fakePage('bbbbbbbb:00000005');
    t.switchPage(other);
    await t.look();
    expect(t.deps.suggest).not.toHaveBeenCalled();
  });

  it('does not look while it may not, and starts afresh after', async () => {
    const t = setup();
    await t.look();
    t.setActive(false);
    t.page().set('aaaaaaaa:00000002');
    t.page().executeJavaScriptInIsolatedWorld.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 0));
    t.deps.every.mock.calls[0]?.[0]();
    expect(t.page().executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    t.setActive(true);
    await t.look();
    expect(t.deps.suggest).not.toHaveBeenCalled();
  });

  it('suggests nothing when it became inactive while it looked, or the page answered nonsense', async () => {
    const t = setup();
    await t.look();
    t.page().set('aaaaaaaa:00000002');
    t.page().executeJavaScriptInIsolatedWorld.mockImplementationOnce(() => {
      t.setActive(false);
      return Promise.resolve('aaaaaaaa:00000002');
    });
    await t.look();
    t.setActive(true);
    t.page().set('nonsense');
    await t.look();
    t.page().set(new Error('loading'));
    await t.look();
    expect(t.deps.suggest).not.toHaveBeenCalled();
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
    finish('aaaaaaaa:00000001');
    // Once that look ends, the next tick looks again.
    await vi.waitFor(() => {
      tick?.();
      expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
    });
  });
});
