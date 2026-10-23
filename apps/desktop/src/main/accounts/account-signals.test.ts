import { describe, expect, it, vi } from 'vitest';
import { accountSignals } from './account-signals.ts';

function setup() {
  const deps = { setTitle: vi.fn(), showUnread: vi.fn(), initialTitle: 'YapYap' };
  return { deps, signals: accountSignals(deps) };
}

describe('accountSignals', () => {
  it('shows the active account’s title, or the product name before it has one', () => {
    const t = setup();
    t.signals.activate('a');
    t.signals.pageTitle('b', '(4) WhatsApp');
    t.signals.pageTitle('a', 'WhatsApp');
    t.signals.activate('b');
    expect(t.deps.setTitle.mock.calls).toEqual([['YapYap'], ['WhatsApp'], ['(4) WhatsApp']]);
  });

  it('adds up the unread chats of every account, and drops a removed one', () => {
    const t = setup();
    t.signals.pageTitle('a', '(2) WhatsApp');
    t.signals.pageTitle('b', '(3) WhatsApp');
    t.signals.forget('a');
    expect(t.deps.showUnread.mock.calls).toEqual([[2], [5], [3]]);
    expect([t.signals.unreadOf('a'), t.signals.unreadOf('b'), t.signals.unreadOf('c')]).toEqual([
      0, 3, 0,
    ]);
  });

  it('marks the title while offline and restores it when back online', () => {
    const t = setup();
    t.signals.activate('a');
    t.signals.pageTitle('a', 'WhatsApp');
    t.signals.setOnline(false);
    t.signals.pageTitle('a', '(1) WhatsApp');
    t.signals.setOnline(true);
    expect(t.deps.setTitle.mock.calls.slice(1)).toEqual([
      ['WhatsApp'],
      ['WhatsApp (offline)'],
      ['(1) WhatsApp (offline)'],
      ['(1) WhatsApp'],
    ]);
  });
});
