import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ChromeApi, MarketplaceEntry, MarketplaceView } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.plugins.marketplace;

/** What a failed load means to the user. */
const PROBLEMS: Readonly<Record<Exclude<MarketplaceView['status'], 'ready'>, string>> = {
  unreachable: text.unreachable,
  invalid: text.invalid,
  outdated: text.outdated,
};

const describe = (capability: string): string =>
  (en.plugins.capabilities as Readonly<Record<string, string>>)[capability] ?? capability;

/** The plugin's one action, or why there is none. */
function Action(props: {
  readonly plugin: MarketplaceEntry;
  readonly busy: boolean;
  readonly onInstall: (id: string) => void;
}): JSX.Element {
  const { plugin } = props;
  if (plugin.action === 'installed' || plugin.action === 'incompatible') {
    return <span class="hint">{text[plugin.action]}</span>;
  }
  const update = plugin.action === 'update';
  return (
    <button
      type="button"
      class="primary"
      disabled={props.busy}
      aria-label={
        update
          ? text.updateLabel({ plugin: plugin.name, version: plugin.version })
          : text.installLabel({ plugin: plugin.name })
      }
      onClick={() => {
        props.onInstall(plugin.id);
      }}
    >
      {update ? text.update({ version: plugin.version }) : text.install}
    </button>
  );
}

function Listing(props: {
  readonly plugin: MarketplaceEntry;
  readonly busy: boolean;
  readonly onInstall: (id: string) => void;
}): JSX.Element {
  const { plugin } = props;
  const grants = [...plugin.capabilities.map(describe), ...plugin.hosts];
  return (
    <li>
      <h2 class="name">{plugin.name}</h2>
      <span class={`trust trust-${plugin.review}`}>{text[plugin.review]}</span>
      <p class="hint">
        <span>{text.by({ name: plugin.author.name })}</span>{' '}
        <span>{text.version({ version: plugin.version })}</span>
      </p>
      <p>{plugin.summary}</p>
      {grants.length === 0 ? null : (
        <ul class="grants">
          {grants.map((grant) => (
            <li key={grant}>{grant}</li>
          ))}
        </ul>
      )}
      <Action plugin={plugin} busy={props.busy} onInstall={props.onInstall} />
    </li>
  );
}

/** The marketplace list, loaded when the tab opens and again after each install. */
function useMarketplace(api: ChromeApi) {
  const [view, setView] = useState<MarketplaceView | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setView(null);
    api.plugins.marketplace().then(setView, () => {
      setView({ status: 'unreachable', plugins: [] });
    });
  }, [api]);
  useEffect(load, [load]);
  const install = useCallback(
    (id: string) => {
      setBusy(true);
      api.plugins
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

const matches = (plugin: MarketplaceEntry, query: string): boolean =>
  `${plugin.name} ${plugin.summary} ${plugin.author.name}`
    .toLowerCase()
    .includes(query.trim().toLowerCase());

/** The listed plugins, with a search over their names, summaries and authors. */
function MarketplaceList(props: {
  readonly plugins: readonly MarketplaceEntry[];
  readonly busy: boolean;
  readonly onInstall: (id: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const shown = props.plugins.filter((plugin) => matches(plugin, query));
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
        <ul class="plugin-list marketplace">
          {shown.map((plugin) => (
            <Listing
              key={plugin.id}
              plugin={plugin}
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
 * The plugin marketplace (ADR 0014): YapYap's own plugins and reviewed
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
  return <MarketplaceList plugins={view.plugins} busy={busy} onInstall={install} />;
}
