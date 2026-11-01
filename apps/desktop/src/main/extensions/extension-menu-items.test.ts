import { describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID } from '../../adapter/world.ts';
import { extensionMenuItems, type ClickedPage } from './extension-menu-items.ts';
import type { ExtensionAction } from './runtime.ts';

const HELLO = { extension: 'org.example.hello', extensionName: 'Hello', command: 'translate' };

const ACTIONS: ExtensionAction[] = [
  { ...HELLO, title: 'Translate', on: 'composer' },
  { ...HELLO, title: 'Explain', on: 'message' },
  { ...HELLO, title: 'Summarize', on: 'chat' },
];

function clicked(target: unknown, zoom = 1) {
  return {
    executeJavaScriptInIsolatedWorld: vi.fn<ClickedPage['executeJavaScriptInIsolatedWorld']>(() =>
      Promise.resolve(target),
    ),
    getZoomFactor: () => zoom,
  };
}

const extensions = (actions: readonly ExtensionAction[] = ACTIONS) => ({
  actions: () => actions,
  run: vi.fn(() => true),
});

describe('extensionMenuItems', () => {
  it('offers the items for the place the user right-clicked, named after their extension', async () => {
    const menu = extensions();
    const items = await extensionMenuItems(clicked('message'), menu, { x: 10, y: 20 });
    expect(items.map(({ label }) => label)).toEqual(['Hello: Explain']);
    items[0]?.click?.();
    expect(menu.run).toHaveBeenCalledExactlyOnceWith('org.example.hello', 'translate');
    const composer = await extensionMenuItems(clicked('composer'), menu, { x: 10, y: 20 });
    expect(composer.map(({ label }) => label)).toEqual(['Hello: Translate']);
    const chat = await extensionMenuItems(clicked('chat'), menu, { x: 10, y: 20 });
    expect(chat.map(({ label }) => label)).toEqual(['Hello: Summarize']);
  });

  it('asks the page in its own pixels, which zoom scales', async () => {
    const page = clicked('chat', 2);
    await extensionMenuItems(page, extensions(), { x: 100, y: 50 });
    const [world, scripts] = page.executeJavaScriptInIsolatedWorld.mock.lastCall ?? [];
    expect(world).toBe(ADAPTER_WORLD_ID);
    expect(scripts?.[0]?.code).toContain('(document, 50, 25, ');
  });

  it('offers nothing elsewhere, when the page cannot tell, or when no extension has items', async () => {
    expect(await extensionMenuItems(clicked('other'), extensions(), { x: 1, y: 1 })).toEqual([]);
    const failing = clicked(undefined);
    failing.executeJavaScriptInIsolatedWorld.mockRejectedValue(new Error('gone'));
    expect(await extensionMenuItems(failing, extensions(), { x: 1, y: 1 })).toEqual([]);
    const quiet = clicked('message');
    expect(await extensionMenuItems(quiet, extensions([]), { x: 1, y: 1 })).toEqual([]);
    expect(quiet.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  });
});
