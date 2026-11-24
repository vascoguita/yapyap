/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fingerprint,
  lookAtChats,
  NEWEST_MESSAGES,
  newestMessages,
  parseLook,
  parseNewest,
  replyingTo,
  unreadBadges,
} from './incoming.ts';
import { LANDMARKS } from './page-state.ts';

const PLACES = {
  message: LANDMARKS.message,
  outgoing: LANDMARKS.outgoing,
  chatName: LANDMARKS.chatName,
  composer: LANDMARKS.composer,
  composerQuote: LANDMARKS.composerQuote,
  messageBody: LANDMARKS.messageBody,
  messageText: LANDMARKS.messageText,
  emoji: LANDMARKS.emoji,
  quoted: LANDMARKS.quoted,
};

/** Their message, with a bare ID as WhatsApp marks it today (#410). */
const theirs = (id: string) => `<div role="row"><div data-id="${id}">Hi</div></div>`;

/** The account's own message, which carries a tail and a clickable delivery status. */
const mine = (id: string) =>
  `<div role="row"><div data-id="${id}"><span data-testid="tail-out"></span>Hey</div></div>`;

const chat = (name: string, ...rows: string[]) => {
  document.body.innerHTML = `<div id="main"><header><span dir="auto">${name}</span></header>${rows.join('')}</div>`;
};

const probe = () => newestMessages(document, PLACES, fingerprint, replyingTo);
const part = (index: number) => probe()?.split(':')[index];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('newestMessages', () => {
  it('hashes the open chat and its newest message from each side, never handing over a name or an ID', () => {
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'));
    const seen = probe();
    expect(seen).toMatch(/^[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{8}:o:e:[0-9a-f]{8}:-$/);
    expect(seen).not.toContain('Ana');
    expect(seen).not.toContain('3EB0A1');
    const [chatHash, theirsHash, mineHash] = String(seen).split(':');
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'), theirs('3EB0A3'));
    // The same chat, a newer message from someone else, which is now the last.
    expect(part(0)).toBe(chatHash);
    expect(part(1)).not.toBe(theirsHash);
    expect(part(2)).toBe(mineHash);
    expect(part(3)).toBe('i');
  });

  it('changes only the account’s own hash when it replies, and the chat’s in another chat', () => {
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'), theirs('3EB0A3'));
    const [chatHash, theirsHash, mineHash] = String(probe()).split(':');
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'), theirs('3EB0A3'), mine('3EB0A4'));
    expect(part(1)).toBe(theirsHash);
    expect(part(2)).not.toBe(mineHash);
    expect(part(3)).toBe('o');
    chat('Ben', theirs('3EB0A3'));
    expect(part(0)).not.toBe(chatHash);
  });

  it('tells whether the message box holds a draft, never what it says', () => {
    const box = (text: string) =>
      `<footer><div contenteditable="true"><p>${text}</p></div></footer>`;
    chat('Ana', theirs('3EB0A1'), box('Running late'));
    expect(part(4)).toBe('d');
    expect(probe()).not.toContain('Running');
    chat('Ana', theirs('3EB0A1'), box(' <br> '));
    expect(part(4)).toBe('e');
  });

  it('still tells messages apart by the older IDs that named the sender', () => {
    chat('Ana', theirs('false_447700900123@c.us_A1'), theirs('true_447700900123@c.us_B2'));
    expect(part(3)).toBe('o');
    const older = part(1);
    chat('Ana', theirs('false_447700900123@c.us_A1'));
    expect(part(1)).toBe(older);
    expect(part(2)).toBe('-');
  });

  it('marks the side no one wrote on, and finds nothing while no chat is open', () => {
    chat('Ana', mine('3EB0A2'));
    expect(part(1)).toBe('-');
    chat('Ana');
    expect(probe()).toMatch(/^[0-9a-f]{8}:-:-:-:e:-:-$/);
    document.body.innerHTML = '<div id="main"></div>';
    expect(probe()).toBeNull();
    // A row without an ID, should WhatsApp's markup ever match one, still
    // counts; with an empty chat name, both hash as empty text.
    document.body.innerHTML =
      '<div id="main"><header><span dir="auto"></span></header><p></p></div>';
    expect(
      newestMessages(document, { ...PLACES, message: '#main p' }, fingerprint, replyingTo),
    ).toBe('811c9dc5:811c9dc5:-:i:e:811c9dc5:-');
  });

  it('hashes what the last message says, so an edit, which keeps its ID, tells apart (#739)', () => {
    /** Their message as WhatsApp lays out text, after the message it may quote, with `meta` beside it. */
    const said = (text: string, { quote = '', meta = '' } = {}) =>
      `<div data-id="3EB0A1">${quote}<div data-pre-plain-text="[15:13] Ana: "><span data-testid="selectable-text">${text}</span></div>${meta}</div>`;
    chat('Ana', said('See you at 5'));
    const before = part(5);
    expect(probe()).not.toContain('See you');
    chat('Ana', said('See you at 6', { meta: '<span>Edited</span>' }));
    const edited = part(5);
    expect(edited).not.toBe(before);
    // Only the message's own text counts: not the time or a mark beside it, nor the message it quotes.
    chat('Ana', said('See you at 6', { meta: '<span>Edited 15:14</span>' }));
    expect(part(5)).toBe(edited);
    const quote = (text: string) =>
      `<div data-testid="quoted-message"><div data-pre-plain-text="[15:00] Ben: "><span data-testid="selectable-text">${text}</span></div></div>`;
    chat('Ana', said('See you at 6', { quote: quote('When?') }));
    expect(part(5)).toBe(edited);
    // An emoji is in the text as an image.
    const emoji = (plain: string) => `<img data-plain-text="${plain}" alt="">`;
    chat('Ana', said(emoji('👍')));
    const thumbs = part(5);
    chat('Ana', said(emoji('❤️'), { quote: quote(emoji('👍')) }));
    expect(part(5)).not.toBe(thumbs);
    chat('Ana', said(emoji('👍'), { quote: quote(emoji('❤️')) }));
    expect(part(5)).toBe(thumbs);
    // Text without a body of its own, and a row with no text, hash as what they hold.
    document.body.innerHTML =
      '<div id="main"><header><span dir="auto">Ana</span></header><div data-id="3EB0A1"><div data-pre-plain-text="[15:13] Ana: ">See you</div></div></div>';
    expect(part(5)).toBe(fingerprint('See you'));
    chat('Ana', theirs('3EB0A1'));
    expect(part(5)).toBe(fingerprint(''));
  });

  it('hashes a chat name without text as empty text', () => {
    const doc = {
      querySelector: () => ({ textContent: null }),
      querySelectorAll: () => [],
    };
    expect(newestMessages(doc, PLACES, fingerprint, replyingTo)).toBe('811c9dc5:-:-:-:e:-:-');
  });

  it('hashes the message the user replies to above the message box, never what it says (#740)', () => {
    /** The message box, with `quote` above it as WhatsApp shows the message being replied to. */
    const box = (quote: string) => `<footer>${quote}<div contenteditable="true"></div></footer>`;
    const quoting = (text: string) =>
      `<div data-testid="quoted-message"><span data-testid="author">Ana</span><span>${text}</span></div>`;
    chat('Ana', theirs('3EB0A1'), box(''));
    expect(part(6)).toBe('-');
    const unquoted = String(probe());
    chat('Ana', theirs('3EB0A1'), box(quoting('See you at 5')));
    const quoted = part(6);
    expect(quoted).toBe(fingerprint('AnaSee you at 5'));
    expect(probe()).not.toContain('See you');
    // Only the quote changed: what the chat holds stays as it was.
    expect(String(probe()).replace(/:[^:]*$/, ':-')).toBe(unquoted);
    chat('Ana', theirs('3EB0A1'), box(quoting('Dinner?')));
    expect(part(6)).not.toBe(quoted);
  });

  it('never takes a message’s own quote for the message the user replies to (#740)', () => {
    const reply = `<div role="row"><div data-id="3EB0A2"><div data-testid="quoted-message"><span>Dinner?</span></div>Yes</div></div>`;
    chat('Ana', theirs('3EB0A1'), reply);
    expect(part(6)).toBe('-');
    // Should WhatsApp ever put the message box inside a row, its quote still is no message's.
    document.body.innerHTML = `<div id="main"><header><span dir="auto">Ana</span></header><footer><div data-id="3EB0A3"><div data-testid="quoted-message">Dinner?</div></div></footer></div>`;
    expect(part(6)).toBe('-');
  });

  it('hashes a quote without text as empty text', () => {
    const quote = { textContent: null, closest: () => null };
    const doc = { querySelector: () => null, querySelectorAll: () => [quote] };
    expect(replyingTo(doc as never, PLACES, fingerprint)).toBe('811c9dc5');
  });

  it('pads every hash to eight characters, so the answer always parses', () => {
    // This ID hashes below 0x10000000.
    chat('Ana', theirs('3EB011F'));
    expect(part(1)).toBe('0056b8b5');
    expect(parseNewest(probe())).toBeDefined();
  });

  it('looks in the page with the landmarks the adapter keeps', () => {
    // With the fingerprint beside it, which the assistant's bar shares (#741).
    const places = {
      ...PLACES,
      chatRow: LANDMARKS.chatRow,
      unreadCount: LANDMARKS.unreadCount,
      chatTitle: LANDMARKS.chatListName,
    };
    expect(NEWEST_MESSAGES).toBe(
      `(${lookAtChats.toString()})(document, ${JSON.stringify(places)}, ${fingerprint.toString()}, { newest: ${newestMessages.toString()}, quoting: ${replyingTo.toString()}, badges: ${unreadBadges.toString()}, limit: 20 })`,
    );
  });

  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(NEWEST_MESSAGES.includes('stryMutAct'))('runs as standalone source text', () => {
    chat(
      'Ana',
      theirs('3EB0A1'),
      '<footer><div data-testid="quoted-message">Hi</div><div contenteditable="true"></div></footer>',
    );
    expect(part(6)).not.toBe('-');
    // As in the adapter's isolated world, which has the page's document and the browser's TextEncoder.
    expect(runInNewContext(NEWEST_MESSAGES, { document, TextEncoder })).toBe(
      `${String(probe())}|-`,
    );
    document.body.innerHTML = list(row('Ben', '12'));
    expect(runInNewContext(NEWEST_MESSAGES, { document, TextEncoder })).toBe(
      `-|${fingerprint('Ben')}:12`,
    );
  });
});

const BADGES = {
  chatRow: LANDMARKS.chatRow,
  unreadCount: LANDMARKS.unreadCount,
  chatTitle: LANDMARKS.chatListName,
};

/** A chat list row as WhatsApp lays it out, with an unread badge when `count` is given (#100). */
function row(name: string, count?: string, index = 0): string {
  const badge = count === undefined ? '' : `<span data-testid="icon-unread-count">${count}</span>`;
  return `<div role="row" data-testid="list-item-${String(index)}"><div data-testid="cell-frame-title"><span>Chat details</span><span dir="auto" title="${name}">${name}</span></div><div data-testid="cell-frame-secondary"><span>Hi</span>${badge}</div></div>`;
}

const list = (...rows: string[]) => `<div id="pane-side">${rows.join('')}</div>`;

describe('unreadBadges', () => {
  it('hands over each unread chat’s count by the fingerprint of its name alone, never the name (#705)', () => {
    document.body.innerHTML = list(row('Ana', '12'), row('Ben'), row('Cy', ' 3 '));
    const badges = unreadBadges(document, BADGES, fingerprint, 20);
    expect(badges).toBe(`${fingerprint('Ana')}:12,${fingerprint('Cy')}:3`);
    expect(badges).not.toContain('Ana');
  });

  it('names a chat as the open chat’s header does, by its name’s textContent', () => {
    document.body.innerHTML = `${list(row('Ana', '12'))}<div id="main"><header><span dir="auto">Ana</span></header></div>`;
    const [open] = String(newestMessages(document, PLACES, fingerprint, replyingTo)).split(':');
    expect(unreadBadges(document, BADGES, fingerprint, 20)).toBe(`${String(open)}:12`);
  });

  it('counts only badges of numbers, in rows with a name, and at most `limit` of them', () => {
    const noName =
      '<div data-testid="list-item-9"><span data-testid="icon-unread-count">5</span></div>';
    document.body.innerHTML = list(row('Ana', '@'), row('Ben', '0'), row('Cy', ''), noName);
    expect(unreadBadges(document, BADGES, fingerprint, 20)).toBe('-');
    document.body.innerHTML = list(row('Ana', '1', 0), row('Ben', '2', 1), row('Cy', '3', 2));
    expect(unreadBadges(document, BADGES, fingerprint, 2).split(',')).toHaveLength(2);
  });

  it('reads a badge or a name without text as empty', () => {
    const empty = { textContent: null };
    const unread = { textContent: '4' };
    const doc = {
      querySelector: () => null,
      querySelectorAll: () => [
        { querySelector: (selector: string) => (selector === BADGES.chatTitle ? empty : unread) },
        { querySelector: () => empty },
      ],
    };
    expect(unreadBadges(doc as never, BADGES, fingerprint, 20)).toBe('811c9dc5:4');
  });
});

describe('lookAtChats', () => {
  it('joins the open chat’s hashes, or `-` for none, and the badges', () => {
    const probes = { newest: newestMessages, quoting: replyingTo, badges: unreadBadges, limit: 20 };
    const places = { ...PLACES, ...BADGES };
    document.body.innerHTML = list(row('Ana', '12'));
    expect(lookAtChats(document, places, fingerprint, probes)).toBe(`-|${fingerprint('Ana')}:12`);
    chat('Ana', theirs('3EB0A1'));
    expect(lookAtChats(document, places, fingerprint, probes)).toBe(`${String(probe())}|-`);
  });
});

describe('parseLook', () => {
  it('takes the open chat, or none, and the badges’ counts by chat', () => {
    expect(parseLook('0123abcd:-:-:-:e:-:-|-')).toEqual({
      newest: parseNewest('0123abcd:-:-:-:e:-:-'),
      unread: new Map(),
    });
    expect(parseLook('-|0123abcd:12,89abcdef:999999')).toEqual({
      newest: null,
      unread: new Map([
        ['0123abcd', 12],
        ['89abcdef', 999_999],
      ]),
    });
    const twenty = Array.from({ length: 20 }, () => '0123abcd:1').join(',');
    expect(parseLook(`-|${twenty}`)?.unread.get('0123abcd')).toBe(1);
  });

  it('refuses anything else', () => {
    const twentyOne = Array.from({ length: 21 }, () => '0123abcd:1').join(',');
    const refused = [
      undefined,
      null,
      7,
      '',
      '-',
      '-|',
      'x|-',
      '-|-|-',
      '-|0123abcd',
      '-|0123abcd:0',
      '-|0123abcd:01',
      '-|0123abcd:1234567',
      '-|0123abcd:1,',
      '-|ABCDEF01:1',
      `-|${twentyOne}`,
      ['-|-'],
    ];
    for (const value of refused) {
      expect(parseLook(value)).toBeUndefined();
    }
  });
});

describe('parseNewest', () => {
  it('takes the hashes and whose message is last, or no chat, and refuses anything else', () => {
    expect(parseNewest('0123abcd:89abcdef:-:i:e:76543210:-')).toEqual({
      chat: '0123abcd',
      theirs: '89abcdef',
      mine: null,
      theirsLast: true,
      drafting: false,
      said: '76543210',
      quote: null,
    });
    expect(parseNewest('0123abcd:-:89abcdef:o:e:76543210:fedcba98')).toEqual({
      chat: '0123abcd',
      theirs: null,
      mine: '89abcdef',
      theirsLast: false,
      drafting: false,
      said: '76543210',
      quote: 'fedcba98',
    });
    expect(parseNewest('0123abcd:-:-:-:d:-:-')?.drafting).toBe(true);
    expect(parseNewest('0123abcd:-:-:-:e:-:-')).toMatchObject({
      theirsLast: false,
      said: null,
      quote: null,
    });
    expect(parseNewest(null)).toBeNull();
    // An array would spell the right text, were it ever taken for one.
    const refused = [
      undefined,
      7,
      'x',
      '0123abcd:89abcdef',
      '0123abcd:89abcdef:-:x',
      '0123abcd:89abcdef:-:i',
      '0123abcd:89abcdef:-:i:x',
      '0123abcd:89abcdef:-:i:e',
      '0123abcd:89abcdef:-:i:e:x',
      '0123abcd:89abcdef:-:i:e:76543210',
      '0123abcd:89abcdef:-:i:e:76543210:',
      '0123abcd:89abcdef:-:i:e:76543210:x',
      '0123abcd:89abcdef:-:i:e:76543210:-:',
      'x0123abcd:-:-:i',
      '0123abcd:-:-:i0',
      'ABCDEF01:-:-:i',
      '-:-:-:i',
      ['0123abcd:-:-:i:e:-:-'],
    ];
    for (const value of refused) {
      expect(parseNewest(value)).toBeUndefined();
    }
  });
});
