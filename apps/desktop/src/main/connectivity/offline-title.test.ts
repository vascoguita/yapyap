import { describe, expect, it, vi } from 'vitest';
import { offlineTitle, type TitledWindow } from './offline-title.ts';

function setup() {
  let pageTitle: (event: { preventDefault(): void }, title: string) => void = () => undefined;
  const window = {
    on: vi.fn((_event: 'page-title-updated', listener: typeof pageTitle) => {
      pageTitle = listener;
    }),
    setTitle: vi.fn(),
  } satisfies TitledWindow;
  const setOnline = offlineTitle(window, 'YapYap');
  return {
    window,
    setOnline,
    updateTitle: (title: string) => {
      const event = { preventDefault: vi.fn() };
      pageTitle(event, title);
      return event;
    },
  };
}

describe('offlineTitle', () => {
  it('marks the title while offline and restores it when back online', () => {
    const t = setup();
    t.setOnline(false);
    t.setOnline(true);
    expect(t.window.setTitle.mock.calls).toEqual([['YapYap (offline)'], ['YapYap']]);
  });

  it('keeps following the page title, with the mark while offline', () => {
    const t = setup();
    expect(t.updateTitle('(2) WhatsApp').preventDefault).toHaveBeenCalledOnce();
    t.setOnline(false);
    t.updateTitle('(3) WhatsApp');
    expect(t.window.setTitle.mock.calls).toEqual([
      ['(2) WhatsApp'],
      ['(2) WhatsApp (offline)'],
      ['(3) WhatsApp (offline)'],
    ]);
  });
});
