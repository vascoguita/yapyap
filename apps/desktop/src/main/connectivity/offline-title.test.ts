import { describe, expect, it, vi } from 'vitest';
import { offlineTitle, type TitledPage, type TitledWindow } from './offline-title.ts';

function setup() {
  let pageTitle: (event: { preventDefault(): void }, title: string) => void = () => undefined;
  const window = { setTitle: vi.fn() } satisfies TitledWindow;
  const page = {
    on: vi.fn((_event: 'page-title-updated', listener: typeof pageTitle) => {
      pageTitle = listener;
    }),
  } satisfies TitledPage;
  const setOnline = offlineTitle(window, page, 'YapYap');
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

  it('shows the page’s title on the window, with the mark while offline', () => {
    const t = setup();
    t.updateTitle('(2) WhatsApp');
    t.setOnline(false);
    t.updateTitle('(3) WhatsApp');
    expect(t.window.setTitle.mock.calls).toEqual([
      ['(2) WhatsApp'],
      ['(2) WhatsApp (offline)'],
      ['(3) WhatsApp (offline)'],
    ]);
  });
});
