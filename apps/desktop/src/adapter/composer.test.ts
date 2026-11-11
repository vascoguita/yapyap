/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('focuses the message box, then selects all of the draft once the editor settled', async () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true">see you <b>soon</b></div></footer></div>';
    const box = document.querySelector('[contenteditable]');
    // WhatsApp's editor puts its caret back as the box takes the focus.
    box?.addEventListener('focus', () => {
      document.getSelection()?.collapse(box, box.childNodes.length);
    });
    const scope = { setTimeout: vi.fn(setTimeout) };
    const selected = selectComposer(document, scope, LANDMARKS.composer, 30);
    expect(document.activeElement).toBe(box);
    expect(document.getSelection()?.toString()).toBe('');
    expect(scope.setTimeout).toHaveBeenCalledWith(expect.any(Function), 30);
    expect(await selected).toBe(true);
    expect(document.getSelection()?.toString()).toBe('see you soon');
  });

  it('reports a missing message box, and copes with a page without a selection', async () => {
    document.body.innerHTML = '';
    expect(await selectComposer(document, { setTimeout }, LANDMARKS.composer, 0)).toBe(false);
    const box = { focus: () => undefined };
    const page = { querySelector: () => box, getSelection: () => null };
    expect(await selectComposer(page, { setTimeout }, 'x', 0)).toBe(true);
  });

  it.skipIf(SELECT_COMPOSER.includes('stryMutAct'))('runs as standalone source text', async () => {
    document.body.innerHTML =
      '<div id="main"><footer><div contenteditable="true">Hi</div></footer></div>';
    expect(SELECT_COMPOSER).toMatch(/, 30\)$/);
    expect(await runInNewContext(SELECT_COMPOSER, { document, setTimeout, Promise })).toBe(true);
    expect(document.getSelection()?.toString()).toBe('Hi');
  });
});
