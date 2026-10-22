import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import { PAGE_STATE_PROBE, parsePageState, type PageState } from '../../adapter/page-state.ts';

export interface ProbedContents {
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
}

/**
 * Asks the adapter what the WhatsApp page shows, once, on demand. A page that
 * is gone, still loading a new document or returns anything unexpected reads
 * as undefined.
 */
export function readPageState(contents: ProbedContents): Promise<PageState | undefined> {
  return contents
    .executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [{ code: PAGE_STATE_PROBE }])
    .then(parsePageState, () => undefined);
}
