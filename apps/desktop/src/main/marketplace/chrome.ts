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
import { pulledPlugins, type Pulled } from './revocations.ts';
import type { PluginRecords } from '../plugins/records.ts';
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
  /** The installed plugins' records. */
  readonly records: () => Promise<PluginRecords>;
  /** Marks installed plugins the marketplace pulled, and stops them (ADR 0014). */
  readonly pull: (pulled: readonly Pulled[]) => Promise<void>;
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
        if (state.status !== 'ready') {
          return { status: state.status, plugins: [] };
        }
        const records = await deps.records();
        const pulled = pulledPlugins(state.index, records);
        if (pulled.length > 0) {
          await deps.pull(pulled);
        }
        const installed = new Map([...records].map(([id, record]) => [id, record.version]));
        return {
          status: 'ready',
          plugins: marketplaceEntries(state.index, installed, deps.appVersion),
        };
      },
    },
    {
      channel: CHROME_CHANNELS.pluginsInstallListed,
      accepts: isPluginId,
      handle: (_call, id) => installer(deps, load)(id as string),
    },
  ];
}

function installer(
  deps: MarketplaceDependencies,
  load: () => Promise<MarketplaceState>,
): (id: string) => Promise<void> {
  return (id) =>
    installListed(
      {
        ...deps.install,
        load,
        appVersion: deps.appVersion,
        download: deps.fetchArchive,
        archiveUrl: deps.source.archiveUrl,
      },
      id,
    );
}

/**
 * Installs the plugin an **Install in YapYap** link names (ADR 0014), as
 * the Marketplace tab would: from the signed index, through the consent
 * window. While one link is being handled, others are ignored, so a burst
 * of links opens at most one prompt.
 */
export function linkInstaller(deps: MarketplaceDependencies): (id: string) => void {
  const install = installer(deps, loader(deps));
  let busy = false;
  return (id) => {
    if (busy) {
      return;
    }
    busy = true;
    void install(id).finally(() => {
      busy = false;
    });
  };
}
