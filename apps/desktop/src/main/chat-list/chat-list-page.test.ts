import { describe, expect, it, vi } from 'vitest';
import { inPageChatList } from './chat-list-page.ts';

function page() {
  return { executeJavaScriptInIsolatedWorld: vi.fn((): Promise<unknown> => Promise.resolve(true)) };
}

function setup() {
  let tick = (): void => undefined;
  const widths = new Map([['personal', 320]]);
  const port = {
    widths: { get: (account: string) => widths.get(account) },
    visible: vi.fn(() => true),
    every: vi.fn((callback: () => void) => {
      tick = callback;
    }),
  };
  return {
    port,
    tick: () => {
      tick();
    },
  };
}

const sized = (width: string) => [
  1000,
  [{ code: expect.stringContaining(`globalThis, {"width":${width},`) as unknown }],
];

describe('inPageChatList', () => {
  it('sizes nothing until the accounts run', () => {
    const t = setup();
    const list = inPageChatList(t.port);
    expect(t.port.every).toHaveBeenCalledWith(expect.any(Function), 1000);
    list.refresh();
    t.tick();
    expect(t.port.visible).toHaveBeenCalled();
  });

  it('sizes the active account’s list with its own width, in YapYap’s words', () => {
    const t = setup();
    const list = inPageChatList(t.port);
    const personal = page();
    const work = page();
    let active = { account: 'personal', page: personal };
    list.follow(() => active);
    expect(personal.executeJavaScriptInIsolatedWorld).toHaveBeenCalledExactlyOnceWith(
      ...sized('320'),
    );
    expect(personal.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(1000, [
      { code: expect.stringContaining('"label":"Chat list width"') as unknown },
    ]);
    active = { account: 'work', page: work };
    list.refresh();
    expect(work.executeJavaScriptInIsolatedWorld).toHaveBeenCalledExactlyOnceWith(...sized('null'));
  });

  it('sizes it again on its timer only while the window shows', () => {
    const t = setup();
    const list = inPageChatList(t.port);
    const personal = page();
    list.follow(() => ({ account: 'personal', page: personal }));
    t.port.visible.mockReturnValue(false);
    t.tick();
    expect(personal.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce();
    t.port.visible.mockReturnValue(true);
    t.tick();
    expect(personal.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
  });

  it('waits for the next render when the page is between loads', async () => {
    const t = setup();
    const list = inPageChatList(t.port);
    const personal = page();
    personal.executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(new Error('navigated'));
    list.follow(() => ({ account: 'personal', page: personal }));
    await Promise.resolve();
    t.tick();
    expect(personal.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
  });
});
