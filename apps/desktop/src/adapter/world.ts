/** The isolated world adapter code runs in, apart from WhatsApp's own scripts. */
export const ADAPTER_WORLD_ID = 1000;

/** A WhatsApp page that adapter code can run in. */
export interface AdapterPage {
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
}

/**
 * Runs adapter code in the page's adapter world. What comes back is
 * unchecked: each caller parses it before anything else sees it.
 */
export function runInAdapterWorld(page: AdapterPage, code: string): Promise<unknown> {
  return page.executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [{ code }]);
}
