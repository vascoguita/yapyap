import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ChromeApi, MarketplaceEntry, MarketplaceView } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.extensions.marketplace;

/** What a failed load means to the user. */
const PROBLEMS: Readonly<Record<Exclude<MarketplaceView['status'], 'ready'>, string>> = {
  unreachable: text.unreachable,
  invalid: text.invalid,
  outdated: text.outdated,
};

const describe = (capability: string): string =>
  (en.extensions.capabilities as Readonly<Record<string, string>>)[capability] ?? capability;

/** The extension's one action, or why there is none. */
function Action(props: {
  readonly extension: MarketplaceEntry;
  readonly busy: boolean;
  readonly onInstall: (id: string) => void;
}): JSX.Element {
  const { extension } = props;
  if (extension.action === 'installed' || extension.action === 'incompatible') {
    return <span class="hint">{text[extension.action]}</span>;
  }
  const update = extension.action === 'update';
  return (
    <button
      type="button"
      class="primary"
      disabled={props.busy}
      aria-label={
        update
          ? text.updateLabel({ extension: extension.name, version: extension.version })
          : text.installLabel({ extension: extension.name })
      }
      onClick={() => {
        props.onInstall(extension.id);
      }}
    >
      {update ? text.update({ version: extension.version }) : text.install}
    </button>
  );
}

function Listing(props: {
  readonly extension: MarketplaceEntry;
  readonly busy: boolean;
  readonly onInstall: (id: string) => void;
}): JSX.Element {
  const { extension } = props;
  const grants = [...extension.capabilities.map(describe), ...extension.hosts];
  return (
    <li>
      <h2 class="name">{extension.name}</h2>
      <span class={`trust trust-${extension.review}`}>{text[extension.review]}</span>
      <p class="hint">
        <span>{text.by({ name: extension.author.name })}</span>{' '}
        <span>{text.version({ version: extension.version })}</span>
      </p>
      <p>{extension.summary}</p>
      {grants.length === 0 ? null : (
        <ul class="grants">
          {grants.map((grant) => (
            <li key={grant}>{grant}</li>
          ))}
        </ul>
      )}
      {extension.action === 'update' && extension.notes !== null ? (
        <details class="notes">
          <summary>{text.whatsNew({ version: extension.version })}</summary>
          <p>{extension.notes}</p>
        </details>
      ) : null}
      <Action extension={extension} busy={props.busy} onInstall={props.onInstall} />
    </li>
  );
}

/** The marketplace list, loaded when the tab opens and again after each install. */
function useMarketplace(api: ChromeApi) {
  const [view, setView] = useState<MarketplaceView | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setView(null);
    api.extensions.marketplace().then(setView, () => {
      setView({ status: 'unreachable', extensions: [] });
    });
  }, [api]);
  useEffect(load, [load]);
  const install = useCallback(
    (id: string) => {
      setBusy(true);
      api.extensions
        .installListed(id)
        .catch(() => undefined)
        .finally(() => {
          setBusy(false);
          load();
        });
    },
    [api, load],
  );
  return { view, busy, load, install };
}

const matches = (extension: MarketplaceEntry, query: string): boolean =>
  `${extension.name} ${extension.summary} ${extension.author.name}`
    .toLowerCase()
    .includes(query.trim().toLowerCase());

/** The listed extensions, with a search over their names, summaries and authors. */
function MarketplaceList(props: {
  readonly extensions: readonly MarketplaceEntry[];
  readonly busy: boolean;
  readonly onInstall: (id: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const shown = props.extensions.filter((extension) => matches(extension, query));
  return (
    <>
      <p class="hint">{text.privacy}</p>
      <input
        type="search"
        aria-label={text.search}
        placeholder={text.search}
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
        }}
      />
      {shown.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <ul class="extension-list marketplace">
          {shown.map((extension) => (
            <Listing
              key={extension.id}
              extension={extension}
              busy={props.busy}
              onInstall={props.onInstall}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The extension marketplace (ADR 0014): YapYap's own extensions and reviewed
 * third-party ones, each marked as such, with what it asks for before the
 * consent window asks again.
 */
export function Marketplace({ api }: { readonly api: ChromeApi }): JSX.Element {
  const { view, busy, load, install } = useMarketplace(api);
  if (view === null) {
    return <output>{text.loading}</output>;
  }
  if (view.status !== 'ready') {
    return (
      <>
        <p role="alert">{PROBLEMS[view.status]}</p>
        <button type="button" onClick={load}>
          {text.retry}
        </button>
      </>
    );
  }
  return <MarketplaceList extensions={view.extensions} busy={busy} onInstall={install} />;
}
