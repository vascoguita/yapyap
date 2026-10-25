/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FOCUS_COMPOSER,
  focusComposer,
  parseDraft,
  READ_COMPOSER,
  readComposer,
  SELECT_COMPOSER,
  selectComposer,
} from './composer.ts';
import { LANDMARKS } from './page-state.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusComposer', () => {
  it('focuses the open conversation’s message box', () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true"></div></footer></div>';
    expect(focusComposer(document, LANDMARKS.composer)).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[contenteditable]'));
  });

  it('reports a page without one, or with nothing focusable there', () => {
    expect(focusComposer(document, LANDMARKS.composer)).toBe(false);
    expect(focusComposer({ querySelector: () => ({}) }, LANDMARKS.composer)).toBe(false);
  });

  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(FOCUS_COMPOSER.includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true"></div></footer></div>';
    // Only `document` is in scope, as in the isolated world the probe runs in.
    const result: unknown = runInNewContext(FOCUS_COMPOSER, { document });
    expect(result).toBe(true);
  });
});

describe('readComposer', () => {
  it('reads what the user typed, without the line breaks the box ends with', () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true">Running late,<br>sorry  </div></footer></div>';
    expect(readComposer(document, LANDMARKS.composer, 100)).toMatch(/^Running late,\n?sorry$/);
    expect(readComposer(document, LANDMARKS.composer, 7)).toBe('Running');
  });

  it('reads nothing when no chat is open, and what a box without innerText offers', () => {
    expect(readComposer(document, LANDMARKS.composer, 100)).toBeNull();
    expect(readComposer({ querySelector: () => ({ textContent: 'Hi ' }) }, 'x', 100)).toBe('Hi');
    expect(readComposer({ querySelector: () => ({ textContent: null }) }, 'x', 100)).toBe('');
  });

  it.skipIf(READ_COMPOSER.includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true">Hello</div></footer></div>';
    expect(runInNewContext(READ_COMPOSER, { document })).toBe('Hello');
  });
});

describe('parseDraft', () => {
  it('takes text or null, and nothing else', () => {
    expect(parseDraft('Hi')).toBe('Hi');
    expect(parseDraft('')).toBe('');
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('x'.repeat(65_536))).toHaveLength(65_536);
    expect(parseDraft('x'.repeat(65_537))).toBeUndefined();
    expect(parseDraft({ html: '<b>' })).toBeUndefined();
  });
});

describe('selectComposer', () => {
  it('focuses the message box and selects all of the draft in it', () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true">see you <b>soon</b></div></footer></div>';
    expect(selectComposer(document, LANDMARKS.composer)).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[contenteditable]'));
    expect(document.getSelection()?.toString()).toBe('see you soon');
  });

  it('reports a page without one, and copes without a selection', () => {
    expect(selectComposer(document, LANDMARKS.composer)).toBe(false);
    const box = { focus: () => undefined };
    expect(selectComposer({ querySelector: () => box, getSelection: () => null }, 'x')).toBe(true);
  });

  it.skipIf(SELECT_COMPOSER.includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true">Hi</div></footer></div>';
    expect(runInNewContext(SELECT_COMPOSER, { document })).toBe(true);
    expect(document.getSelection()?.toString()).toBe('Hi');
  });
});
