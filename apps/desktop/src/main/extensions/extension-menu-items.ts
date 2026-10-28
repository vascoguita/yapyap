import { clickTargetProbe, parseClickTarget } from '../../adapter/click-target.ts';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import { en } from '../../shared/messages/en.ts';
import type { ContextMenuItem } from '../spelling/context-menu.ts';
import type { ExtensionAction } from './runtime.ts';

/** The WhatsApp page a right click happened on. */
export interface ClickedPage {
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
  getZoomFactor(): number;
}

/** The running extensions' right-click items, and how to run one. */
export interface ExtensionMenu {
  readonly actions: () => readonly ExtensionAction[];
  readonly run: (extension: string, command: string) => boolean;
}

/**
 * The extension items for a right click at `point`, in the page's view
 * coordinates (#98): composer actions in the message box, and context-menu
 * items on a message or on a chat in the list. YapYap draws them in its own
 * native menu, named after their extension, so an extension never draws over
 * WhatsApp. The adapter only says which landmark holds the point, and only
 * when some extension has an item to show.
 */
export async function extensionMenuItems(
  page: ClickedPage,
  extensions: ExtensionMenu,
  point: { readonly x: number; readonly y: number },
): Promise<ContextMenuItem[]> {
  const actions = extensions.actions();
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
    .map(({ extension, extensionName, command, title }) => ({
      label: en.menu.extensionCommand({ extension: extensionName, title }),
      click: () => {
        extensions.run(extension, command);
      },
    }));
}
