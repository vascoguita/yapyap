import { describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import { pluginMenuItems, type ClickedPage } from './plugin-menu-items.ts';
import type { PluginAction } from './runtime.ts';

const HELLO = { plugin: 'org.example.hello', pluginName: 'Hello', command: 'translate' };

const ACTIONS: PluginAction[] = [
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

const plugins = (actions: readonly PluginAction[] = ACTIONS) => ({
  actions: () => actions,
  run: vi.fn(() => true),
});

describe('pluginMenuItems', () => {
  it('offers the items for the place the user right-clicked, named after their plugin', async () => {
    const menu = plugins();
    const items = await pluginMenuItems(clicked('message'), menu, { x: 10, y: 20 });
    expect(items.map(({ label }) => label)).toEqual(['Hello: Explain']);
    items[0]?.click?.();
    expect(menu.run).toHaveBeenCalledExactlyOnceWith('org.example.hello', 'translate');
    const composer = await pluginMenuItems(clicked('composer'), menu, { x: 10, y: 20 });
    expect(composer.map(({ label }) => label)).toEqual(['Hello: Translate']);
    const chat = await pluginMenuItems(clicked('chat'), menu, { x: 10, y: 20 });
    expect(chat.map(({ label }) => label)).toEqual(['Hello: Summarize']);
  });

  it('asks the page in its own pixels, which zoom scales', async () => {
    const page = clicked('chat', 2);
    await pluginMenuItems(page, plugins(), { x: 100, y: 50 });
    const [world, scripts] = page.executeJavaScriptInIsolatedWorld.mock.lastCall ?? [];
    expect(world).toBe(ADAPTER_WORLD_ID);
    expect(scripts?.[0]?.code).toContain('(document, 50, 25, ');
  });

  it('offers nothing elsewhere, when the page cannot tell, or when no plugin has items', async () => {
    expect(await pluginMenuItems(clicked('other'), plugins(), { x: 1, y: 1 })).toEqual([]);
    const failing = clicked(undefined);
    failing.executeJavaScriptInIsolatedWorld.mockRejectedValue(new Error('gone'));
    expect(await pluginMenuItems(failing, plugins(), { x: 1, y: 1 })).toEqual([]);
    const quiet = clicked('message');
    expect(await pluginMenuItems(quiet, plugins([]), { x: 1, y: 1 })).toEqual([]);
    expect(quiet.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  });
});
