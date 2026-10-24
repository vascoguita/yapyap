import { clickTargetProbe, parseClickTarget } from '../../adapter/click-target.ts';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import { en } from '../../shared/messages/en.ts';
import type { ContextMenuItem } from '../spelling/context-menu.ts';
import type { PluginAction } from './runtime.ts';

/** The WhatsApp page a right click happened on. */
export interface ClickedPage {
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
  getZoomFactor(): number;
}

/** The running plugins' right-click items, and how to run one. */
export interface PluginMenu {
  readonly actions: () => readonly PluginAction[];
  readonly run: (plugin: string, command: string) => boolean;
}

/**
 * The plugin items for a right click at `point`, in the page's view
 * coordinates (#98): composer actions in the message box, and context-menu
 * items on a message or on a chat in the list. YapYap draws them in its own
 * native menu, named after their plugin, so a plugin never draws over
 * WhatsApp. The adapter only says which landmark holds the point, and only
 * when some plugin has an item to show.
 */
export async function pluginMenuItems(
  page: ClickedPage,
  plugins: PluginMenu,
  point: { readonly x: number; readonly y: number },
): Promise<ContextMenuItem[]> {
  const actions = plugins.actions();
  if (actions.length === 0) {
    return [];
  }
  // The page measures in CSS pixels, which zoom makes larger than the view's.
  const zoom = page.getZoomFactor();
  const code = clickTargetProbe(point.x / zoom, point.y / zoom);
  const found = await page
    .executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [{ code }])
    .catch(() => undefined);
  const target = parseClickTarget(found);
  return actions
    .filter(({ on }) => on === target)
    .map(({ plugin, pluginName, command, title }) => ({
      label: en.menu.pluginCommand(pluginName, title),
      click: () => {
        plugins.run(plugin, command);
      },
    }));
}
