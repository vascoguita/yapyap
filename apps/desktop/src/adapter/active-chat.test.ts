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
};
const LIMITS = { messages: 2, text: 10, name: 8 };

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
        { outgoing: true, text: 'Hi there, ' },
        { outgoing: false, text: 'See you' },
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
    expect(readActiveChat(page(chat), PLACES, { messages: 5, text: 50, name: 20 })).toEqual({
      name: 'Ana',
      group: false,
      messages: [
        { outgoing: false, text: 'Hi' },
        { outgoing: true, text: 'Hello' },
        { outgoing: true, text: 'How are you?' },
      ],
    });
  });

  it('knows a group by its messages’ IDs', () => {
    const group = `<div id="main">${row('false_120363000000000001@g.us_B1_447700900123@c.us', 'Hey')}</div>`;
    expect(readActiveChat(page(group), PLACES, LIMITS)).toEqual({
      name: '',
      group: true,
      messages: [{ outgoing: false, text: 'Hey' }],
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
        selector === PLACES.outgoing ? null : { textContent: 'Body' },
    };
    const doc = {
      querySelector: (selector: string) => (selector === PLACES.chatName ? text : {}),
      querySelectorAll: () => [message],
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
    expect(readActiveChat({ ...empty, querySelectorAll: () => [blank] }, PLACES, LIMITS)).toEqual({
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
      messages: [{ outgoing: false, text: 'See you' }],
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
    expect(parseActiveChat('Team', 1)).toBeUndefined();
  });
});
