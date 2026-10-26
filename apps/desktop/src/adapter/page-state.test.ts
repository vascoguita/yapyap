/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  describePageState,
  LANDMARKS,
  LANDMARKS_VERSION,
  PAGE_STATE_PROBE,
  parsePageState,
  probePageState,
  unreadInTitle,
} from './page-state.ts';

function page(html: string, title = 'WhatsApp'): Document {
  document.title = title;
  document.body.innerHTML = html;
  return document;
}

const CHATS = '<div id="app"><div id="pane-side"></div></div>';

describe('unreadInTitle', () => {
  it('reads the leading count, and nothing else', () => {
    expect(
      ['(3) WhatsApp', 'WhatsApp', 'WhatsApp (3)', '(1234567) WhatsApp'].map(unreadInTitle),
    ).toEqual([3, 0, 0, 0]);
  });

  it('agrees with the page probe, which repeats its pattern', () => {
    const titles = fc.oneof(
      fc.string(),
      fc.tuple(fc.nat(), fc.string()).map(([count, rest]) => `(${String(count)})${rest}`),
    );
    fc.assert(
      fc.property(titles, (title) => {
        // Title change events carry `document.title`, whitespace already collapsed.
        const doc = page(CHATS, title);
        expect(unreadInTitle(doc.title)).toBe(probePageState(doc, LANDMARKS).unread);
      }),
    );
  });
});

describe('probePageState', () => {
  it('reports the chat list with no chat open', () => {
    expect(probePageState(page(CHATS), LANDMARKS)).toEqual({
      view: 'chats',
      chatOpen: false,
      unread: 0,
    });
  });

  it('reports an open conversation', () => {
    const html = '<div id="app"><div id="pane-side"></div><div id="main"></div></div>';
    expect(probePageState(page(html), LANDMARKS).chatOpen).toBe(true);
  });

  it('reads the unread count from the title', () => {
    expect(probePageState(page(CHATS, '(3) WhatsApp'), LANDMARKS).unread).toBe(3);
    expect(probePageState(page(CHATS, '(999999) WhatsApp'), LANDMARKS).unread).toBe(999_999);
  });

  it.each(['WhatsApp', 'WhatsApp (3)', '(abc) WhatsApp', '(1234567) WhatsApp'])(
    'counts no unread chats for the title %j',
    (title) => {
      expect(probePageState(page(CHATS, title), LANDMARKS).unread).toBe(0);
    },
  );

  it('reports the logged-out QR code, ignoring any count', () => {
    const html = '<div id="app"><div data-ref="token"><canvas></canvas></div></div>';
    expect(probePageState(page(html, '(2) WhatsApp'), LANDMARKS)).toEqual({
      view: 'logged-out',
      chatOpen: false,
      unread: 0,
    });
  });

  it('reports the loading screen before the chat list appears', () => {
    expect(probePageState(page('<div id="app"><progress></progress></div>'), LANDMARKS)).toEqual({
      view: 'loading',
      chatOpen: false,
      unread: 0,
    });
  });

  it('reports an unknown page, keeping the count, when the root landmark is missing', () => {
    expect(
      probePageState(
        page('<div id="pane-side"></div><div id="main"></div>', '(4) WhatsApp'),
        LANDMARKS,
      ),
    ).toEqual({
      view: 'unknown',
      chatOpen: false,
      unread: 4,
    });
  });

  it('counts unread chats while loading', () => {
    expect(probePageState(page('<div id="app"></div>', '(5) WhatsApp'), LANDMARKS).unread).toBe(5);
  });

  // Mutation runs instrument the function with calls to a module-level helper,
  // so only uninstrumented source can run on its own; the logic is still
  // mutation-tested through the direct calls above.
  it.skipIf(PAGE_STATE_PROBE.includes('stryMutAct'))(
    'runs as standalone source text with the landmark table',
    () => {
      page('<div id="app"><div id="pane-side"></div><div id="main"></div></div>', '(7) WhatsApp');
      // Only `document` is in scope, as in the isolated world the probe runs in.
      const result: unknown = runInNewContext(PAGE_STATE_PROBE, { document });
      expect(result).toEqual({ view: 'chats', chatOpen: true, unread: 7 });
    },
  );
});

describe('parsePageState', () => {
  it.each([
    { view: 'chats', chatOpen: true, unread: 0 },
    { view: 'logged-out', chatOpen: false, unread: 0 },
    { view: 'loading', chatOpen: false, unread: 999_999 },
    { view: 'unknown', chatOpen: false, unread: 1 },
  ])('accepts %j', (value) => {
    expect(parsePageState(value)).toEqual(value);
  });

  it('keeps only the known fields', () => {
    expect(parsePageState({ view: 'chats', chatOpen: false, unread: 2, name: 'x' })).toEqual({
      view: 'chats',
      chatOpen: false,
      unread: 2,
    });
  });

  it.each([
    null,
    undefined,
    'chats',
    {},
    { view: 'inbox', chatOpen: false, unread: 0 },
    { view: 'chats', chatOpen: 'no', unread: 0 },
    { view: 'chats', chatOpen: false, unread: '3' },
    { view: 'chats', chatOpen: false, unread: -1 },
    { view: 'chats', chatOpen: false, unread: 1.5 },
    { view: 'chats', chatOpen: false, unread: 1_000_000 },
  ])('rejects %j', (value) => {
    expect(parsePageState(value)).toBeUndefined();
  });
});

describe('describePageState', () => {
  it('names the view and the landmark table, never the unread count', () => {
    expect(describePageState({ view: 'chats', chatOpen: true, unread: 12 })).toBe(
      'WhatsApp view=chats, chat_open=true (landmarks v4)',
    );
    expect(LANDMARKS_VERSION).toBe(4);
  });

  it('says when the page could not be read', () => {
    expect(describePageState(undefined)).toBe('WhatsApp page unavailable (landmarks v4)');
  });
});
