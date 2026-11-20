/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { activeChatReader, describeItem, parseActiveChat, readActiveChat } from './active-chat.ts';
import { LANDMARKS } from './page-state.ts';

const PLACES = {
  conversation: LANDMARKS.conversation,
  chatName: LANDMARKS.chatName,
  message: LANDMARKS.message,
  messageText: LANDMARKS.messageText,
  messageBody: LANDMARKS.messageBody,
  outgoing: LANDMARKS.outgoing,
  author: LANDMARKS.author,
  quoted: LANDMARKS.quoted,
  kinds: [
    ['call', LANDMARKS.callLog],
    ['sticker', LANDMARKS.sticker],
    ['animated-emoji', LANDMARKS.animatedEmoji],
    ['voice', LANDMARKS.voiceMessage],
    ['video', LANDMARKS.video],
    ['photo', LANDMARKS.photo],
    ['media', LANDMARKS.mediaToDownload],
  ] as const,
  emoji: LANDMARKS.emoji,
  bubble: LANDMARKS.bubble,
};
const LIMITS = { messages: 2, text: 10, name: 8, quote: 6, meta: 40 };

const row = (id: string, text: string) =>
  `<div data-id="${id}"><div data-pre-plain-text="[08:00, 24/10/2026] Someone: "><span>${text}</span></div><span>08:00</span></div>`;

function page(body: string): Document {
  document.body.innerHTML = body;
  return document;
}

const CHAT = `
<div id="main">
  <header><span dir="auto">Test Chat One</span></header>
  ${row('false_447700900123@c.us_A1', 'Hello')}
  ${row('true_447700900123@c.us_A2', 'Hi there, how are you?')}
  <div data-id="false_447700900123@c.us_A3"><img alt=""></div>
  ${row('false_447700900123@c.us_A4', '  See you  ')}
</div>`;

describe('readActiveChat', () => {
  it('reads the open chat’s name and its last messages’ text, oldest first, within limits', () => {
    expect(readActiveChat(page(CHAT), PLACES, LIMITS)).toEqual({
      name: 'Test Cha',
      group: false,
      messages: [
        { outgoing: true, text: 'Hi there, ', meta: '[08:00, 24/10/2026] Someone: ' },
        { outgoing: false, text: 'See you', meta: '[08:00, 24/10/2026] Someone: ' },
      ],
    });
  });

  it('reads today’s page, which marks the account’s messages by their tail and status, not their ID', () => {
    const today = (id: string, text: string, own: string) =>
      `<div role="row"><div data-testid="conv-msg-${id}" data-id="${id}">${own}<div data-pre-plain-text="[09:30] "><span data-testid="selectable-text">${text}</span><span aria-hidden="true">09:30</span></div><div data-testid="msg-meta"${own === '' ? '' : ' role="button"'}><span>09:30</span></div></div></div>`;
    const chat = `<div id="main"><header><span data-testid="conversation-info-header-chat-title">Ana</span><span dir="auto">online</span></header>
      ${today('3A1', 'Hi', '')}
      ${today('3A2', 'Hello', '<span data-testid="tail-out"></span>')}
      ${today('3A3', 'How are you?', '<span></span>')}</div>`;
    expect(
      readActiveChat(page(chat), PLACES, { messages: 5, text: 50, name: 20, quote: 50, meta: 4 }),
    ).toEqual({
      name: 'Ana',
      group: false,
      messages: [
        { outgoing: false, text: 'Hi', meta: '[09:' },
        { outgoing: true, text: 'Hello', meta: '[09:' },
        { outgoing: true, text: 'How are you?', meta: '[09:' },
      ],
    });
  });

  it('knows a group by its messages’ IDs', () => {
    const group = `<div id="main">${row('false_120363000000000001@g.us_B1_447700900123@c.us', 'Hey')}</div>`;
    expect(readActiveChat(page(group), PLACES, LIMITS)).toEqual({
      name: '',
      group: true,
      messages: [{ outgoing: false, text: 'Hey', meta: '[08:00, 24/10/2026] Someone: ' }],
    });
  });

  it('reads the message a reply quotes, apart from the reply’s own text and mark', () => {
    const reply = `<div data-id="3EB0C1">
      <div data-testid="quoted-message"><span data-testid="author">Ana</span><div data-pre-plain-text="[07:00] Ana: "><span data-testid="selectable-text">Snacks?</span></div></div>
      <div data-pre-plain-text="[08:00] Rui: "><span data-testid="selectable-text">Me!</span></div></div>`;
    const unnamed = `<div data-id="3EB0C2"><div data-testid="quoted-message"><span>A photo you sent</span></div><div data-pre-plain-text="[08:01] Rui: "><span data-testid="selectable-text">Nice</span></div></div>`;
    const empty = `<div data-id="3EB0C3"><div data-testid="quoted-message"><span data-testid="author">Ana</span></div><div data-pre-plain-text="[08:02] Rui: "><span data-testid="selectable-text">Ok</span></div></div>`;
    const long = `<div data-id="3EB0C4"><div data-testid="quoted-message"><span data-testid="author">Ana Maria Lopes</span><span>Hi</span></div><div data-pre-plain-text="[08:03] Rui: "><span data-testid="selectable-text">Yo</span></div></div>`;
    const limits = { ...LIMITS, messages: 5, text: 20 };
    expect(readActiveChat(page(`<div id="main">${long}</div>`), PLACES, limits)).toMatchObject({
      messages: [{ text: 'Yo', quote: { author: 'Ana Mari', text: 'Hi' } }],
    });
    expect(
      readActiveChat(page(`<div id="main">${reply}${unnamed}${empty}</div>`), PLACES, limits),
    ).toMatchObject({
      messages: [
        { text: 'Me!', meta: '[08:00] Rui: ', quote: { author: 'Ana', text: 'Snacks' } },
        { text: 'Nice', meta: '[08:01] Rui: ', quote: { author: '', text: 'A phot' } },
        { text: 'Ok', meta: '[08:02] Rui: ' },
      ],
    });
    expect(
      (
        readActiveChat(page(`<div id="main">${empty}</div>`), PLACES, limits) as {
          messages: object[];
        }
      ).messages[0],
    ).not.toHaveProperty('quote');
  });

  it('knows a group by the sender names WhatsApp shows only in groups, but not by a quote’s', () => {
    // Today's IDs are bare (#410): a group shows who wrote each message from someone else.
    const named = `<div data-id="3EB0B1"><span data-testid="author">Ana</span><div data-pre-plain-text="x"><span>Hey</span></div></div>`;
    expect(readActiveChat(page(`<div id="main">${named}</div>`), PLACES, LIMITS)).toMatchObject({
      group: true,
    });
    const quoting = `<div data-id="3EB0B2"><div data-testid="quoted-message"><span data-testid="author">Ana</span></div><div data-pre-plain-text="x"><span>Yes</span></div></div>`;
    expect(readActiveChat(page(`<div id="main">${quoting}</div>`), PLACES, LIMITS)).toMatchObject({
      group: false,
    });
  });

  it('names what a message is when it is not only text, with its caption or sender where it has them', () => {
    // Rows as WhatsApp draws them (#723): none but a captioned one has a copy mark.
    const item = (id: string, inside: string, own = '') =>
      `<div data-id="${id}"><div data-testid="msg-container">${own}${inside}</div></div>`;
    const chat = `<div id="main"><header><span dir="auto">Ana</span></header>
      ${item('C1', '<div data-testid="call-log-system-message"><div data-testid="voip_icce_bubble_1on1_call"></div></div>')}
      ${item('C2', '<span data-testid="author">Rui</span><div data-testid="sticker-container"><img></div>')}
      ${item('C3', '<div data-testid="lottie-animated-emoji-container"></div>', '<span data-testid="tail-out"></span>')}
      ${item('C4', '<div role="slider"></div><canvas></canvas>')}
      ${item('C5', '<video></video>')}
      ${item('C6', '<div data-testid="image-thumb"><img></div><div data-pre-plain-text="[10:00] Ana: "><span data-testid="selectable-text">Look</span></div>')}
      ${item('C7', '<div data-testid="media-album-grid-cell"><img></div>')}
      ${item('C8', '<div data-testid="media-state-download"></div>')}
      ${item('C9', '<div>a document</div>')}
      ${item('C10', '<span data-testid="selectable-text"><img data-plain-text="🖤"><img data-plain-text="🔥"></span>')}
      <div data-id="C11" data-virtualized="true"></div></div>`;
    expect(readActiveChat(page(chat), PLACES, { ...LIMITS, messages: 20 })).toEqual({
      name: 'Ana',
      group: true,
      messages: [
        { outgoing: false, text: '', kind: 'call' },
        { outgoing: false, text: '', kind: 'sticker', author: 'Rui' },
        { outgoing: true, text: '', kind: 'animated-emoji' },
        { outgoing: false, text: '', kind: 'voice' },
        { outgoing: false, text: '', kind: 'video' },
        { outgoing: false, text: 'Look', kind: 'photo', meta: '[10:00] Ana: ' },
        { outgoing: false, text: '', kind: 'photo' },
        { outgoing: false, text: '', kind: 'media' },
        { outgoing: false, text: '', kind: 'other' },
        { outgoing: false, text: '🖤🔥' },
      ],
    });
  });

  it('reads a sender above a message only without a copy mark, never a quote’s, within limits', () => {
    const chat = `<div id="main">
      <div data-id="E1"><div data-testid="msg-container"><span data-testid="author">Ana Maria Lopes</span><div data-testid="sticker-container"></div></div></div>
      <div data-id="E2"><div data-testid="msg-container"><div data-testid="quoted-message"><span data-testid="author">Rui</span></div><div data-testid="sticker-container"></div></div></div>
      <div data-id="E3"><span data-testid="author">Rui</span><div data-pre-plain-text="[09:30] "><span data-testid="selectable-text">Hi</span></div></div>
      <div data-id="E4" data-virtualized="true"><div data-testid="msg-container"><div data-pre-plain-text="[09:31] "><span data-testid="selectable-text">Old</span></div></div></div>
      <div data-id="E5" data-virtualized="false"><span data-testid="selectable-text"><img data-plain-text="🖤"></span></div></div>`;
    expect(readActiveChat(page(chat), PLACES, { ...LIMITS, messages: 9 })).toStrictEqual({
      name: '',
      group: true,
      messages: [
        { outgoing: false, text: '', kind: 'sticker', author: 'Ana Mari' },
        { outgoing: false, text: '', kind: 'sticker' },
        { outgoing: false, text: 'Hi', meta: '[09:30] ' },
        { outgoing: false, text: '🖤' },
      ],
    });
  });

  it('trims a sender read from a page without innerText', () => {
    const author = { textContent: ' Rui ', closest: () => null, querySelector: () => null };
    const row = {
      textContent: null,
      closest: () => null,
      querySelector: (selector: string) => (selector === LANDMARKS.sticker ? {} : null),
      querySelectorAll: (selector: string) => (selector === PLACES.author ? [author] : []),
    };
    expect(describeItem(row, '', false, PLACES, LIMITS)).toStrictEqual({
      text: '',
      kind: 'sticker',
      author: 'Rui',
    });
  });

  it('leaves out a row with neither words nor a bubble, and an emoji image without its text', () => {
    const chat = `<div id="main">
      <div data-id="D1"><div></div></div>
      <div data-id="D2"><div data-testid="msg-container"><span data-testid="selectable-text"><img data-plain-text></span></div></div></div>`;
    expect(readActiveChat(page(chat), PLACES, LIMITS)).toMatchObject({
      messages: [{ outgoing: false, text: '', kind: 'other' }],
    });
  });

  it('reads nothing when no chat is open', () => {
    expect(readActiveChat(page('<div id="app"></div>'), PLACES, LIMITS)).toBeNull();
  });

  it('reads what a page without innerText or IDs offers', () => {
    const text = { textContent: ' Plain ', querySelector: () => null };
    const message = {
      textContent: null,
      querySelector: (selector: string) =>
        selector === PLACES.messageBody || selector === PLACES.messageText
          ? { textContent: 'Body' }
          : null,
    };
    const doc = {
      querySelector: (selector: string) => (selector === PLACES.chatName ? text : {}),
      // No sender names on this page: it is no group.
      querySelectorAll: (selector: string) => (selector.endsWith(PLACES.author) ? [] : [message]),
    };
    expect(readActiveChat(doc, PLACES, LIMITS)).toEqual({
      name: 'Plain',
      group: false,
      messages: [{ outgoing: false, text: 'Body' }],
    });
    const empty = {
      ...doc,
      querySelector: (selector: string) => (selector === PLACES.chatName ? null : {}),
    };
    // An emoji image there keeps no text aside, so the message has none.
    const blank = {
      textContent: null,
      querySelector: () => null,
      querySelectorAll: (selector: string) => (selector === PLACES.emoji ? [{}] : []),
    };
    const blanks = (selector: string) => (selector.endsWith(PLACES.author) ? [] : [blank]);
    expect(readActiveChat({ ...empty, querySelectorAll: blanks }, PLACES, LIMITS)).toEqual({
      name: '',
      group: false,
      messages: [],
    });
  });
});

describe('activeChatReader', () => {
  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(activeChatReader(1).includes('stryMutAct'))('runs as standalone source text', () => {
    const result = runInNewContext(activeChatReader(1), { document: page(CHAT) }) as unknown;
    expect(parseActiveChat(result, 1)).toEqual({
      name: 'Test Chat One',
      group: false,
      messages: [
        { outgoing: false, text: 'See you', time: '08:00, 24/10/2026', author: 'Someone' },
      ],
    });
  });
});

describe('activeChatReader’s places', () => {
  it('gives the page every kind with its marker, the first that matches winning', () => {
    const source = activeChatReader(1);
    for (const [kind, selector] of PLACES.kinds) {
      expect(source).toContain(JSON.stringify([kind, selector]));
    }
    expect(source).toContain(JSON.stringify(PLACES.kinds));
    for (const selector of [PLACES.emoji, PLACES.bubble, PLACES.conversation, PLACES.quoted]) {
      expect(source).toContain(JSON.stringify(selector));
    }
  });
});

describe('parseActiveChat', () => {
  const chat = { name: 'Team', group: true, messages: [{ outgoing: false, text: 'Hi' }] };

  it('takes the reader’s shape and nothing else', () => {
    expect(parseActiveChat(chat, 1)).toEqual(chat);
    const sticker = { outgoing: false, text: '', kind: 'sticker', author: 'Rui' };
    expect(parseActiveChat({ ...chat, messages: [sticker] }, 1)?.messages).toEqual([sticker]);
    expect(
      parseActiveChat({ ...chat, messages: [{ ...sticker, kind: 'gif' }] }, 1),
    ).toBeUndefined();
    expect(parseActiveChat(null, 1)).toBeNull();
    expect(parseActiveChat(chat, 0)).toBeUndefined();
    expect(parseActiveChat({ ...chat, html: '<b>' }, 1)).toBeUndefined();
    expect(
      parseActiveChat({ ...chat, messages: [{ outgoing: false, text: '' }] }, 1),
    ).toBeUndefined();
    expect(parseActiveChat({ ...chat, name: 'x'.repeat(257) }, 1)).toBeUndefined();
    expect(
      parseActiveChat(
        { ...chat, messages: [{ outgoing: false, text: 'Hi', meta: 'x'.repeat(321) }] },
        1,
      ),
    ).toBeUndefined();
    expect(
      parseActiveChat(
        { ...chat, messages: [{ outgoing: false, text: 'Hi', quote: { author: 'A', text: '' } }] },
        1,
      ),
    ).toBeUndefined();
    expect(parseActiveChat('Team', 1)).toBeUndefined();
    const hi = { outgoing: false, text: 'Hi' };
    for (const message of [
      { ...hi, text: 'x'.repeat(4097) },
      { ...hi, author: 'x'.repeat(257) },
      { ...hi, quote: { author: 'x'.repeat(257), text: 'a' } },
      { ...hi, html: '<b>' },
      { ...hi, quote: { author: 'A', text: 'a', html: '<b>' } },
    ]) {
      expect(parseActiveChat({ ...chat, messages: [message] }, 1)).toBeUndefined();
    }
  });

  it('reads the time and sender from WhatsApp’s copy mark, where it has them', () => {
    const marked = (meta: string) => ({
      ...chat,
      messages: [{ outgoing: false, text: 'Hi', meta }],
    });
    expect(parseActiveChat(marked('[20:01, 24/10/2026] Ana Lima: '), 1)?.messages).toEqual([
      { outgoing: false, text: 'Hi', time: '20:01, 24/10/2026', author: 'Ana Lima' },
    ]);
    expect(parseActiveChat(marked('[8:05 PM, 10/24/2026] Dr. Rui: Jr: '), 1)?.messages).toEqual([
      { outgoing: false, text: 'Hi', time: '8:05 PM, 10/24/2026', author: 'Dr. Rui: Jr' },
    ]);
    expect(parseActiveChat(marked('[09:30] '), 1)?.messages).toEqual([
      { outgoing: false, text: 'Hi', time: '09:30' },
    ]);
    expect(parseActiveChat(marked('[1] Ana: '), 1)?.messages).toEqual([
      { outgoing: false, text: 'Hi', time: '1', author: 'Ana' },
    ]);
    for (const mark of ['no mark', '[] Ana: ', '[09:30 Ana: ', 'x [09:30] Ana: ']) {
      expect(parseActiveChat(marked(mark), 1)?.messages).toEqual([{ outgoing: false, text: 'Hi' }]);
    }
  });

  it('names senders known only by their number Person 1, Person 2…, the same person alike', () => {
    const found = parseActiveChat(
      {
        name: 'Team',
        group: true,
        messages: [
          { outgoing: false, text: 'a', meta: '[1:00] +44 7700 900123: ' },
          { outgoing: false, text: 'b', meta: '[1:01] Ana: ' },
          {
            outgoing: false,
            text: 'c',
            meta: '[1:02] +44\u00a07700\u00a0900456: ',
            quote: { author: '+44 7700 900123', text: 'a' },
          },
          {
            outgoing: false,
            text: 'd',
            meta: '[1:03] +44 7700 900123: ',
            quote: { author: 'Ana', text: 'b' },
          },
        ],
      },
      4,
    );
    expect(found?.messages.map(({ author, quote }) => [author, quote?.author])).toEqual([
      ['Person 1', undefined],
      ['Ana', undefined],
      ['Person 2', 'Person 1'],
      ['Person 1', 'Ana'],
    ]);
    expect(JSON.stringify(found)).not.toMatch(/7700/);
  });
});
