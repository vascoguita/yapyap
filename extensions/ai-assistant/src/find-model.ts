import type { ExtensionHost, LocalModelServer } from '@yapyap/extension-sdk';
import { LOCAL_SERVER_KEY } from './settings.ts';

/**
 * How looking for a model on this computer ended: a server with models was
 * found and kept, or why not, as a reason the panel and the bar explain.
 */
export type SearchOutcome =
  'found' | 'no-server' | 'no-models' | 'search-refused' | 'search-unsupported' | 'search-failed';

/** What YapYap's refusals mean here: the user said no, or a YapYap too old to look. */
const REFUSALS: ReadonlyMap<unknown, SearchOutcome> = new Map([
  ['not-granted', 'search-refused'],
  ['invalid', 'search-unsupported'],
]);

async function servers(
  host: Pick<ExtensionHost, 'localModels'>,
): Promise<readonly LocalModelServer[] | SearchOutcome> {
  try {
    return await host.localModels.find();
  } catch (error) {
    const { kind } = Object(error) as { kind?: unknown };
    return REFUSALS.get(kind) ?? 'search-failed';
  }
}

/**
 * Has YapYap look for a model server on this computer (#456), on the
 * user's click, and keeps the first that serves a model as the provider
 * until the user chooses one. YapYap still asks the user before the
 * assistant's first request to it.
 */
export async function findModel(
  host: Pick<ExtensionHost, 'localModels' | 'storage'>,
): Promise<SearchOutcome> {
  const found = await servers(host);
  if (typeof found === 'string') {
    return found;
  }
  const usable = found.find(({ models }) => models.length > 0);
  if (usable === undefined) {
    return found.length === 0 ? 'no-server' : 'no-models';
  }
  await host.storage.set(LOCAL_SERVER_KEY, { endpoint: usable.endpoint });
  return 'found';
}
