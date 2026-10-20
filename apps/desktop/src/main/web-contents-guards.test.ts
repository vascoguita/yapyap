import { describe, expect, it, vi } from 'vitest';
import {
  installWebContentsGuards,
  preventWebviews,
  type GuardedApp,
  type GuardedContents,
  type PreventableEvent,
} from './web-contents-guards.ts';

function fakeContents() {
  const listeners: ((event: PreventableEvent) => void)[] = [];
  const contents = {
    on: vi.fn((_event: 'will-attach-webview', listener: (event: PreventableEvent) => void) => {
      listeners.push(listener);
    }),
  } satisfies GuardedContents;
  return { contents, listeners };
}

function fakeApp() {
  let created: (event: unknown, contents: GuardedContents) => void = () => undefined;
  const app = {
    on: vi.fn((_event: 'web-contents-created', listener: typeof created) => {
      created = listener;
    }),
  } satisfies GuardedApp;
  return {
    app,
    create: (contents: GuardedContents) => {
      created({}, contents);
    },
  };
}

describe('preventWebviews', () => {
  it('prevents every webview from attaching', () => {
    const { contents, listeners } = fakeContents();
    preventWebviews(contents);
    const event = { preventDefault: vi.fn() };
    for (const listener of listeners) listener(event);
    expect(contents.on).toHaveBeenCalledWith('will-attach-webview', expect.any(Function));
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});

describe('installWebContentsGuards', () => {
  it('applies every guard to every web contents as it is created', () => {
    const { app, create } = fakeApp();
    const guards = [vi.fn(), vi.fn()];
    installWebContentsGuards(app, guards);
    expect(app.on).toHaveBeenCalledWith('web-contents-created', expect.any(Function));
    const [first, second] = [fakeContents().contents, fakeContents().contents];
    create(first);
    create(second);
    for (const guard of guards) expect(guard.mock.calls).toEqual([[first], [second]]);
  });

  it('prevents webviews by default', () => {
    const { app, create } = fakeApp();
    installWebContentsGuards(app);
    const { contents } = fakeContents();
    create(contents);
    expect(contents.on).toHaveBeenCalledWith('will-attach-webview', expect.any(Function));
  });
});
