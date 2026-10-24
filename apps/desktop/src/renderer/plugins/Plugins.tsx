import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  ChromeApi,
  InstalledPlugin,
  PluginActivity,
  PluginList,
} from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.plugins;

function PluginRow({ plugin }: { readonly plugin: InstalledPlugin }): JSX.Element {
  return (
    <li>
      <span class="name">{plugin.id}</span>
      <span class="hint">{text.version(plugin.version)}</span>
      <span class={`trust trust-${plugin.trust}`}>{text.trust[plugin.trust]}</span>
    </li>
  );
}

/** A capability in the words the consent window used for it. */
const describe = (capability: string): string =>
  (text.capabilities as Readonly<Record<string, string>>)[capability] ?? capability;

function Activity({ activity }: { readonly activity: readonly PluginActivity[] }): JSX.Element {
  return (
    <section aria-labelledby="activity-title">
      <h2 id="activity-title">{text.activity.title}</h2>
      <p class="hint">{text.activity.hint}</p>
      {activity.length === 0 ? (
        <p>{text.activity.empty}</p>
      ) : (
        <ul class="activity">
          {activity.map((entry) => (
            <li key={`${entry.time}|${entry.plugin}|${entry.method}|${entry.outcome}`}>
              <time dateTime={entry.time}>{new Date(entry.time).toLocaleString()}</time>
              <span class="name">{entry.plugin}</span>
              <span>{describe(entry.capability)}</span>
              <span class={`outcome outcome-${entry.outcome}`}>
                {text.activity.outcomes[entry.outcome]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The installed plugins, each marked by who vouches for it, so a third-party
 * or unsigned plugin never passes for one of YapYap's own.
 */
export function Plugins({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const [list, setList] = useState<PluginList | null>(null);
  useEffect(() => {
    api.plugins.list().then(setList, () => undefined);
  }, [api]);
  if (list === null) {
    return null;
  }
  return (
    <main class="plugins">
      <h1>{text.title}</h1>
      <p class="hint">{text.hint}</p>
      {list.developerMode ? (
        <p class="warning" role="alert">
          {text.developerMode}
        </p>
      ) : null}
      {list.plugins.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <ul class="plugin-list">
          {list.plugins.map((plugin) => (
            <PluginRow key={plugin.id} plugin={plugin} />
          ))}
        </ul>
      )}
      <Activity activity={list.activity} />
    </main>
  );
}
