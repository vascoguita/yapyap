/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { NEWEST_INCOMING, newestIncoming, parseIncoming } from './incoming.ts';
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

const probe = () => newestIncoming(document, PLACES);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('newestIncoming', () => {
  it('hashes the open chat and its newest message from someone else, never handing over a name or an ID', () => {
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'));
    const seen = probe();
    expect(seen).toMatch(/^[0-9a-f]{8}:[0-9a-f]{8}$/);
    expect(seen).not.toContain('Ana');
    expect(seen).not.toContain('3EB0A1');
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'), theirs('3EB0A3'));
    const next = probe();
    // The same chat, a newer message from someone else.
    expect(next?.split(':')[0]).toBe(seen?.split(':')[0]);
    expect(next?.split(':')[1]).not.toBe(seen?.split(':')[1]);
    // The account's own reply changes nothing.
    chat('Ana', theirs('3EB0A1'), mine('3EB0A2'), theirs('3EB0A3'), mine('3EB0A4'));
    expect(probe()).toBe(next);
    chat('Ben', theirs('3EB0A3'));
    expect(probe()?.split(':')[0]).not.toBe(seen?.split(':')[0]);
  });

  it('still tells messages apart by the older IDs that named the sender', () => {
    chat('Ana', theirs('false_447700900123@c.us_A1'), theirs('true_447700900123@c.us_B2'));
    const older = probe();
    chat('Ana', theirs('false_447700900123@c.us_A1'));
    expect(probe()).toBe(older);
  });

  it('finds nothing when no one else wrote in the open chat', () => {
    chat('Ana', mine('3EB0A2'));
    expect(probe()).toBeNull();
    // A row without an ID, should WhatsApp's markup ever match one, still counts.
    document.body.innerHTML = '<div id="main"><p></p></div>';
    expect(newestIncoming(document, { ...PLACES, message: '#main p' })).toMatch(/^[0-9a-f]{8}:/);
  });

  it('runs as standalone source text', () => {
    chat('Ana', theirs('3EB0A1'));
    // As in the adapter's isolated world, which has the page's document and the browser's TextEncoder.
    expect(runInNewContext(NEWEST_INCOMING, { document, TextEncoder })).toBe(probe());
  });
});

describe('parseIncoming', () => {
  it('takes two hashes, or nothing seen, and refuses anything else', () => {
    expect(parseIncoming('0123abcd:89abcdef')).toEqual({ chat: '0123abcd', message: '89abcdef' });
    expect(parseIncoming(null)).toEqual({ chat: null, message: null });
    for (const value of [undefined, 7, 'x', '0123abcd:89abcdef0', 'ABCDEF01:00000000']) {
      expect(parseIncoming(value)).toBeUndefined();
    }
  });
});
