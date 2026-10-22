import { describe, expect, it, vi } from 'vitest';
import { followUnreadCount, unreadBadge } from './unread-badge.ts';

function badge(platform: string) {
  const deps = {
    platform,
    setBadgeCount: vi.fn(() => true),
    setOverlayIcon: vi.fn(),
    createImage: vi.fn((drawing: { width: number }) => ({ drawn: drawing.width })),
  };
  return { deps, show: unreadBadge(deps) };
}

describe('unreadBadge', () => {
  it.each(['darwin', 'linux'])('sets the app badge count on %s', (platform) => {
    const { deps, show } = badge(platform);
    show(4);
    show(0);
    expect(deps.setBadgeCount.mock.calls).toEqual([[4], [0]]);
    expect(deps.setOverlayIcon).not.toHaveBeenCalled();
  });

  it('draws a taskbar overlay on Windows, described for screen readers', () => {
    const { deps, show } = badge('win32');
    show(1);
    show(12);
    show(0);
    expect(deps.setOverlayIcon.mock.calls).toEqual([
      [{ drawn: 32 }, '1 unread chat'],
      [{ drawn: 32 }, '12 unread chats'],
      [null, ''],
    ]);
    expect(deps.setBadgeCount).not.toHaveBeenCalled();
  });

  it('does nothing when the count did not change', () => {
    const { deps, show } = badge('darwin');
    show(0);
    show(2);
    show(2);
    expect(deps.setBadgeCount.mock.calls).toEqual([[2]]);
  });
});

describe('followUnreadCount', () => {
  it('reads the count from each new page title', () => {
    let listener: ((event: unknown, title: string) => void) | undefined;
    const window = {
      on: vi.fn((_event: 'page-title-updated', handler: typeof listener) => {
        listener = handler;
      }),
    };
    const show = vi.fn();
    followUnreadCount(window, show);
    listener?.({}, '(7) WhatsApp');
    listener?.({}, 'WhatsApp');
    expect(show.mock.calls).toEqual([[7], [0]]);
  });
});
