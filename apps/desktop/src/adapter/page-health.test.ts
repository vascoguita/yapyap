/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PAGE_HEALTH_PROBE, parsePageHealth, probePageHealth } from './page-health.ts';

function page(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('probePageHealth', () => {
  it('reports a working WhatsApp page as healthy', () => {
    expect(
      probePageHealth(page('<div id="app"><div><header>Chats</header><main>Hi</main></div></div>')),
    ).toEqual({ unsupported: false, blank: false });
  });

  it.each([
    'WhatsApp works with Google Chrome 85+',
    'To use WhatsApp, update Chrome or use another browser.',
    'Please update Google Chrome',
    'This browser is not supported',
    'Your browser is no longer supported',
    'Browser not supported',
  ])('recognizes the unsupported-browser page: %s', (text) => {
    expect(probePageHealth(page(`<div><h1>${text}</h1></div>`)).unsupported).toBe(true);
  });

  it('treats a page with no text and almost no elements as blank', () => {
    expect(probePageHealth(page(''))).toEqual({ unsupported: false, blank: true });
    expect(probePageHealth(page('<div><div></div></div>')).blank).toBe(true);
    expect(probePageHealth(page('<div>  \n  </div>')).blank).toBe(true);
    expect(probePageHealth({ body: null })).toEqual({ unsupported: false, blank: true });
  });

  it('does not treat a loading screen with progress elements as blank', () => {
    expect(probePageHealth(page('<div><svg></svg><progress></progress></div>')).blank).toBe(false);
    expect(probePageHealth(page('<p>Loading your chats</p>')).blank).toBe(false);
  });

  // Mutation runs instrument the function with calls to a module-level helper,
  // so only uninstrumented source can run on its own; the heuristics are still
  // mutation-tested through the direct calls above.
  it.skipIf(PAGE_HEALTH_PROBE.includes('stryMutAct'))(
    'runs as standalone source text and returns only booleans',
    () => {
      page('<p>WhatsApp works with Google Chrome</p>');
      // Only `document` is in scope, as in the isolated world the probe runs in.
      const result: unknown = runInNewContext(PAGE_HEALTH_PROBE, { document });
      expect(result).toEqual({ unsupported: true, blank: false });
    },
  );
});

describe('parsePageHealth', () => {
  it('accepts exactly two booleans', () => {
    expect(parsePageHealth({ unsupported: false, blank: true })).toEqual({
      unsupported: false,
      blank: true,
    });
  });

  it.each([null, undefined, 'ok', {}, { unsupported: 'no', blank: false }, { unsupported: true }])(
    'rejects %j',
    (value) => {
      expect(parsePageHealth(value)).toBeUndefined();
    },
  );
});
