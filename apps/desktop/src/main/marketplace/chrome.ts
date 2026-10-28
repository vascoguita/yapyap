import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestSchema } from '@yapyap/extension-sdk';
import { Value } from 'typebox/value';
import { CHROME_CHANNELS, type MarketplaceView } from '../../shared/chrome-api.ts';
import { writeTextAtomically } from '../atomic-write.ts';
import { noArguments, type ChromeHandler } from '../chrome/ipc.ts';
import type { InstallFlowDependencies } from '../extensions/install-flow.ts';
import { loadMarketplace, type Fetcher, type MarketplaceState } from './index-client.ts';
import { installListed } from './install.ts';
import { marketplaceEntries } from './listing.ts';
import { pulledExtensions, type Pulled } from './revocations.ts';
import type { ExtensionRecords } from '../extensions/records.ts';
import type { MarketplaceSource } from './source.ts';

/**
 * Beside the extensions' records, starting with a dot so it never shares a
 * name with an extension's folder: the highest index serial accepted (ADR 0014).
 */
const SERIAL_FILE = '.marketplace.json';

export interface MarketplaceDependencies {
  readonly source: MarketplaceSource;
  readonly appVersion: string;
  /** Downloads the index and its signature, up to the index's size limit. */
  readonly fetchIndex: Fetcher;
  /** Downloads an archive, up to the archive size limit. */
  readonly fetchArchive: Fetcher;
  /** Where extensions are installed; the serial is kept there. */
  readonly root: string;
  /** The installed extensions' records. */
  readonly records: () => Promise<ExtensionRecords>;
  /** Marks installed extensions the marketplace pulled, and stops them (ADR 0014). */
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
        // Nothing may be installed yet, so the extensions folder may not exist.
        await mkdir(deps.root, { recursive: true });
        writeTextAtomically(join(deps.root, SERIAL_FILE), `${JSON.stringify({ serial })}\n`);
      },
    });
}

const isExtensionId = ([id, ...rest]: readonly unknown[]): boolean =>
  rest.length === 0 && Value.Check(ManifestSchema.properties.id, id);

/**
 * The Extensions window's marketplace (ADR 0014): the list, downloaded only
 * when the window asks for it, and installing a listed extension by ID. The
 * page never names a URL or a file, only the extension.
 */
export function marketplaceHandlers(deps: MarketplaceDependencies): ChromeHandler[] {
  const load = loader(deps);
  return [
    {
      channel: CHROME_CHANNELS.extensionsMarketplace,
      accepts: noArguments,
      handle: async (): Promise<MarketplaceView> => {
        const state = await load();
        if (state.status !== 'ready') {
          return { status: state.status, extensions: [] };
        }
        const records = await deps.records();
        const pulled = pulledExtensions(state.index, records);
        if (pulled.length > 0) {
          await deps.pull(pulled);
        }
        const installed = new Map([...records].map(([id, record]) => [id, record.version]));
        return {
          status: 'ready',
          extensions: marketplaceEntries(state.index, installed, deps.appVersion),
        };
      },
    },
    {
      channel: CHROME_CHANNELS.extensionsInstallListed,
      accepts: isExtensionId,
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
 * Installs the extension an **Install in YapYap** link names (ADR 0014), as
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
