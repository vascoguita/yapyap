import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestSchema } from '@yapyap/plugin-sdk';
import { Value } from 'typebox/value';
import { CHROME_CHANNELS, type MarketplaceView } from '../../shared/chrome-api.ts';
import { writeTextAtomically } from '../atomic-write.ts';
import { noArguments, type ChromeHandler } from '../chrome/ipc.ts';
import type { InstallFlowDependencies } from '../plugins/install-flow.ts';
import { loadMarketplace, type Fetcher, type MarketplaceState } from './index-client.ts';
import { installListed } from './install.ts';
import { marketplaceEntries } from './listing.ts';
import type { MarketplaceSource } from './source.ts';

/**
 * Beside the plugins' records, starting with a dot so it never shares a
 * name with a plugin's folder: the highest index serial accepted (ADR 0014).
 */
const SERIAL_FILE = '.marketplace.json';

export interface MarketplaceDependencies {
  readonly source: MarketplaceSource;
  readonly appVersion: string;
  /** Downloads the index and its signature, up to the index's size limit. */
  readonly fetchIndex: Fetcher;
  /** Downloads an archive, up to the archive size limit. */
  readonly fetchArchive: Fetcher;
  /** Where plugins are installed; the serial is kept there. */
  readonly root: string;
  /** The installed plugins' versions, by ID. */
  readonly installed: () => Promise<ReadonlyMap<string, string>>;
  readonly install: Pick<InstallFlowDependencies, 'prepare' | 'commit' | 'ask' | 'report'>;
}

async function lastSerial(root: string): Promise<number> {
  try {
    const { serial } = JSON.parse(await readFile(join(root, SERIAL_FILE), 'utf8')) as {
      serial?: unknown;
    };
    return Number.isSafeInteger(serial) ? (serial as number) : 0;
  } catch {
    return 0;
  }
}

function loader(deps: MarketplaceDependencies): () => Promise<MarketplaceState> {
  return () =>
    loadMarketplace({
      indexUrl: deps.source.indexUrl,
      signatureUrl: deps.source.signatureUrl,
      anchors: deps.source.anchors,
      fetch: deps.fetchIndex,
      now: () => new Date(),
      lastSerial: () => lastSerial(deps.root),
      saveSerial: async (serial) => {
        // Nothing may be installed yet, so the plugins folder may not exist.
        await mkdir(deps.root, { recursive: true });
        writeTextAtomically(join(deps.root, SERIAL_FILE), `${JSON.stringify({ serial })}\n`);
      },
    });
}

const isPluginId = ([id, ...rest]: readonly unknown[]): boolean =>
  rest.length === 0 && Value.Check(ManifestSchema.properties.id, id);

/**
 * The Plugins window's marketplace (ADR 0014): the list, downloaded only
 * when the window asks for it, and installing a listed plugin by ID. The
 * page never names a URL or a file, only the plugin.
 */
export function marketplaceHandlers(deps: MarketplaceDependencies): ChromeHandler[] {
  const load = loader(deps);
  return [
    {
      channel: CHROME_CHANNELS.pluginsMarketplace,
      accepts: noArguments,
      handle: async (): Promise<MarketplaceView> => {
        const state = await load();
        return state.status === 'ready'
          ? {
              status: 'ready',
              plugins: marketplaceEntries(state.index, await deps.installed(), deps.appVersion),
            }
          : { status: state.status, plugins: [] };
      },
    },
    {
      channel: CHROME_CHANNELS.pluginsInstallListed,
      accepts: isPluginId,
      handle: (_call, id) =>
        installListed(
          {
            ...deps.install,
            load,
            appVersion: deps.appVersion,
            download: deps.fetchArchive,
            archiveUrl: deps.source.archiveUrl,
          },
          id as string,
        ),
    },
  ];
}
