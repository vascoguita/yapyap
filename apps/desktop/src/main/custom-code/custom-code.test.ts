import { describe, expect, it, vi } from 'vitest';
import { MAX_SNIPPET, NO_CUSTOM_CODE, type CustomCode } from '../../shared/custom-code.ts';
import {
  createCustomCode,
  CUSTOM_CODE_WORLD_ID,
  isCustomCode,
  parseCustomCode,
} from './custom-code.ts';

const WORK = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';
const HOME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function page() {
  let count = 0;
  const loads: (() => void)[] = [];
  return {
    insertCSS: vi.fn<(css: string) => Promise<string>>(() => {
      count += 1;
      return Promise.resolve(`key-${String(count)}`);
    }),
    removeInsertedCSS: vi.fn<(key: string) => Promise<void>>(() => Promise.resolve()),
    executeJavaScriptInIsolatedWorld: vi.fn<
      (world: number, scripts: { readonly code: string }[]) => Promise<unknown>
    >(() => Promise.resolve(undefined)),
    on: vi.fn((_event: 'dom-ready', listener: () => void) => {
      loads.push(listener);
    }),
    isDestroyed: vi.fn(() => false),
    load: () => {
      for (const listener of loads) {
        listener();
      }
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

const CODE: CustomCode = {
  enabled: true,
  snippets: {
    all: { css: 'body { color: red }', js: 'document.body.dataset.all = "1";' },
    [WORK]: { css: '#app { margin: 0 }', js: 'document.body.dataset.work = "1";' },
  },
};

function setup(saved: CustomCode | string | undefined = CODE) {
  const file = {
    read: vi.fn(() => (typeof saved === 'object' ? JSON.stringify(saved) : saved)),
    write: vi.fn(),
  };
  const warn = vi.fn();
  return { file, warn, code: createCustomCode(file, warn) };
}

const cssIn = (target: ReturnType<typeof page>) => target.insertCSS.mock.calls.map(([css]) => css);
const scriptsIn = (target: ReturnType<typeof page>) =>
  target.executeJavaScriptInIsolatedWorld.mock.calls.map(([world, scripts]) => [
    world,
    scripts.map((script) => script.code),
  ]);

describe('parseCustomCode', () => {
  it('reads a saved file, and turns custom code off for anything else', () => {
    expect(parseCustomCode(JSON.stringify(CODE))).toEqual(CODE);
    expect(parseCustomCode(undefined)).toBe(NO_CUSTOM_CODE);
    expect(parseCustomCode('{')).toBe(NO_CUSTOM_CODE);
    expect(parseCustomCode('{"enabled":true}')).toBe(NO_CUSTOM_CODE);
  });

  it('accepts snippets up to their size, and no more', () => {
    const sized = (length: number) => ({
      enabled: true,
      snippets: { all: { css: 'a'.repeat(length), js: '' } },
    });
    expect(isCustomCode(sized(MAX_SNIPPET))).toBe(true);
    expect(isCustomCode(sized(MAX_SNIPPET + 1))).toBe(false);
    expect(isCustomCode({ ...CODE, extra: 1 })).toBe(false);
  });
});

describe('createCustomCode', () => {
  it('does nothing until the user turns it on', async () => {
    const t = setup({ ...CODE, enabled: false });
    const work = page();
    t.code.attach(work, WORK);
    work.load();
    await settle();
    expect(work.insertCSS).not.toHaveBeenCalled();
    expect(work.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    expect(setup('').code.current()).toBe(NO_CUSTOM_CODE);
    const unreadable = {
      read: () => {
        throw new Error('EACCES');
      },
      write: vi.fn(),
    };
    expect(createCustomCode(unreadable, vi.fn()).current()).toBe(NO_CUSTOM_CODE);
  });

  it('applies the snippets for all accounts, then the account’s own, on every load', async () => {
    const t = setup();
    const work = page();
    const home = page();
    t.code.attach(work, WORK);
    t.code.attach(home, HOME);
    work.load();
    home.load();
    await settle();
    expect(cssIn(work)).toEqual(['body { color: red }', '#app { margin: 0 }']);
    expect(cssIn(home)).toEqual(['body { color: red }']);
    expect(scriptsIn(work)).toEqual([
      [CUSTOM_CODE_WORLD_ID, ['(() => {\ndocument.body.dataset.all = "1";\n})();']],
      [CUSTOM_CODE_WORLD_ID, ['(() => {\ndocument.body.dataset.work = "1";\n})();']],
    ]);
    work.load();
    await settle();
    // A new document has none of the old stylesheets, so none is removed.
    expect(work.removeInsertedCSS).not.toHaveBeenCalled();
    expect(work.insertCSS).toHaveBeenCalledTimes(4);
  });

  it('saves a change and restyles the pages at once', async () => {
    const t = setup();
    const work = page();
    t.code.attach(work, WORK);
    work.load();
    await settle();
    const next = { enabled: true, snippets: { all: { css: 'p { color: blue }', js: '' } } };
    // A stylesheet the page already dropped does not stop the change.
    work.removeInsertedCSS.mockRejectedValueOnce(new Error('unknown key'));
    t.code.save(next);
    await settle();
    expect(t.file.write).toHaveBeenCalledExactlyOnceWith(JSON.stringify(next));
    expect(t.code.current()).toBe(next);
    expect(work.removeInsertedCSS.mock.calls).toEqual([['key-1'], ['key-2']]);
    expect(cssIn(work).at(-1)).toBe('p { color: blue }');
    t.code.save({ ...next, enabled: false });
    await settle();
    expect(work.removeInsertedCSS).toHaveBeenLastCalledWith('key-3');
    expect(work.insertCSS).toHaveBeenCalledTimes(3);
  });

  it('previews unsaved CSS in the pages of its scope only, until it is dropped', async () => {
    const t = setup({ ...CODE, enabled: false });
    const work = page();
    const home = page();
    t.code.attach(work, WORK);
    t.code.attach(home, HOME);
    t.code.preview(WORK, 'h1 { color: green }');
    await settle();
    expect(cssIn(work)).toEqual(['h1 { color: green }']);
    expect(home.insertCSS).not.toHaveBeenCalled();
    // A preview for all accounts restyles every page.
    t.code.preview('all', '');
    await settle();
    expect(cssIn(home)).toEqual([]);
    expect(cssIn(work)).toEqual(['h1 { color: green }', 'h1 { color: green }']);
    t.code.preview(WORK, undefined);
    await settle();
    expect(work.removeInsertedCSS.mock.calls).toEqual([['key-1'], ['key-2']]);
    expect(work.insertCSS).toHaveBeenCalledTimes(2);
    expect(t.file.write).not.toHaveBeenCalled();
  });

  it('keeps going when a script fails, and logs only that it failed', async () => {
    const t = setup();
    const work = page();
    work.executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(new SyntaxError('secret'));
    t.code.attach(work, WORK);
    work.load();
    await settle();
    expect(work.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
    expect(t.warn).toHaveBeenCalledExactlyOnceWith('A custom script failed in WhatsApp.');
  });

  it('forgets pages that are gone, and stylesheets a closing page could not take', async () => {
    const t = setup();
    const gone = page();
    const closing = page();
    t.code.attach(gone, WORK);
    t.code.attach(closing, HOME);
    gone.isDestroyed.mockReturnValue(true);
    closing.insertCSS.mockRejectedValue(new Error('destroyed'));
    closing.removeInsertedCSS.mockRejectedValue(new Error('destroyed'));
    closing.load();
    await settle();
    t.code.save(CODE);
    t.code.save(CODE);
    await settle();
    expect(gone.insertCSS).not.toHaveBeenCalled();
    expect(closing.removeInsertedCSS).not.toHaveBeenCalled();
  });
});
