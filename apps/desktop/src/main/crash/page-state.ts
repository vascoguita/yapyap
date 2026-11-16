import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { PAGE_STATE_PROBE, parsePageState, type PageState } from '../../adapter/page-state.ts';

/**
 * Asks the adapter what the WhatsApp page shows, once, on demand. A page that
 * is gone, still loading a new document or returns anything unexpected reads
 * as undefined.
 */
export function readPageState(contents: AdapterPage): Promise<PageState | undefined> {
  return runInAdapterWorld(contents, PAGE_STATE_PROBE).then(parsePageState, () => undefined);
}
