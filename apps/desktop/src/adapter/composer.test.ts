/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { FOCUS_COMPOSER, focusComposer } from './composer.ts';
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
