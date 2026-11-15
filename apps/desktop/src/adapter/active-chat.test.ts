/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { activeChatReader, parseActiveChat, readActiveChat } from './active-chat.ts';
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

  it('reads nothing when no chat is open', () => {
    expect(readActiveChat(page('<div id="app"></div>'), PLACES, LIMITS)).toBeNull();
  });

  it('reads what a page without innerText or IDs offers', () => {
    const text = { textContent: ' Plain ', querySelector: () => null };
    const message = {
      textContent: null,
      querySelector: (selector: string) =>
        selector === PLACES.outgoing || selector === PLACES.quoted ? null : { textContent: 'Body' },
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
    const blank = { textContent: null, querySelector: () => null };
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

describe('parseActiveChat', () => {
  const chat = { name: 'Team', group: true, messages: [{ outgoing: false, text: 'Hi' }] };

  it('takes the reader’s shape and nothing else', () => {
    expect(parseActiveChat(chat, 1)).toEqual(chat);
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
