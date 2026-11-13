/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { NEWEST_MESSAGES, newestMessages, parseNewest } from './incoming.ts';
import { LANDMARKS } from './page-state.ts';

const PLACES = {
  message: LANDMARKS.message,
  outgoing: LANDMARKS.outgoing,
  chatName: LANDMARKS.chatName,
};

/** Their message, with a bare ID as WhatsApp marks it today (#410). */
const theirs = (id: string) => `<div role="row"><div data-id="${id}">Hi</div></div>`;

/** The account's own message, which carries a tail and a clickable delivery status. */
const mine = (id: string) =>
  `<div role="row"><div data-id="${id}"><span data-testid="tail-out"></span>Hey</div></div>`;

const chat = (name: string, ...rows: string[]) => {
  document.body.innerHTML = `<div id="main"><header><span dir="auto">${name}</span></header>${rows.join('')}</div>`;
};

const probe = () => newestMessages(document, PLACES);
const part = (index: number) => probe()?.split(':')[index];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('newestMessages', () => {
  it('hashes the open chat and its newest message from each side, never handing over a name or an ID', () => {
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'));
    const seen = probe();
    expect(seen).toMatch(/^[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{8}:o$/);
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
    expect(probe()).toMatch(/^[0-9a-f]{8}:-:-:-$/);
    document.body.innerHTML = '<div id="main"></div>';
    expect(probe()).toBeNull();
    // A row without an ID, should WhatsApp's markup ever match one, still
    // counts; with an empty chat name, both hash as empty text.
    document.body.innerHTML =
      '<div id="main"><header><span dir="auto"></span></header><p></p></div>';
    expect(newestMessages(document, { ...PLACES, message: '#main p' })).toBe(
      '811c9dc5:811c9dc5:-:i',
    );
  });

  it('hashes a chat name without text as empty text', () => {
    const doc = {
      querySelector: () => ({ textContent: null }),
      querySelectorAll: () => [],
    };
    expect(newestMessages(doc, PLACES)).toBe('811c9dc5:-:-:-');
  });

  it('pads every hash to eight characters, so the answer always parses', () => {
    // This ID hashes below 0x10000000.
    chat('Ana', theirs('3EB011F'));
    expect(part(1)).toBe('0056b8b5');
    expect(parseNewest(probe())).toBeDefined();
  });

  it('looks in the page with the landmarks the adapter keeps', () => {
    expect(NEWEST_MESSAGES.endsWith(`(document, ${JSON.stringify(PLACES)})`)).toBe(true);
  });

  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(NEWEST_MESSAGES.includes('stryMutAct'))('runs as standalone source text', () => {
    chat('Ana', theirs('3EB0A1'));
    // As in the adapter's isolated world, which has the page's document and the browser's TextEncoder.
    expect(runInNewContext(NEWEST_MESSAGES, { document, TextEncoder })).toBe(probe());
  });
});

describe('parseNewest', () => {
  it('takes the hashes and whose message is last, or no chat, and refuses anything else', () => {
    expect(parseNewest('0123abcd:89abcdef:-:i')).toEqual({
      chat: '0123abcd',
      theirs: '89abcdef',
      mine: null,
      theirsLast: true,
    });
    expect(parseNewest('0123abcd:-:89abcdef:o')).toEqual({
      chat: '0123abcd',
      theirs: null,
      mine: '89abcdef',
      theirsLast: false,
    });
    expect(parseNewest('0123abcd:-:-:-')?.theirsLast).toBe(false);
    expect(parseNewest(null)).toBeNull();
    // An array would spell the right text, were it ever taken for one.
    const refused = [
      undefined,
      7,
      'x',
      '0123abcd:89abcdef',
      '0123abcd:89abcdef:-:x',
      'x0123abcd:-:-:i',
      '0123abcd:-:-:i0',
      'ABCDEF01:-:-:i',
      '-:-:-:i',
      ['0123abcd:-:-:i'],
    ];
    for (const value of refused) {
      expect(parseNewest(value)).toBeUndefined();
    }
  });
});
