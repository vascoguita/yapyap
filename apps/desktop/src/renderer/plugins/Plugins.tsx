import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  ChromeApi,
  InstalledPlugin,
  PluginActivity,
  PluginGrant,
  PluginList,
} from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.plugins;

type GrantChange = (
  plugin: string,
  capability: string,
  account: string | null,
  granted: boolean,
) => void;

function Toggle(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly plugin: string;
  readonly capability: string;
  readonly account: string | null;
  readonly onChange: GrantChange;
}): JSX.Element {
  const id = [props.plugin, props.capability, props.account ?? ''].join('|');
  return (
    <label class="grant" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => {
          props.onChange(
            props.plugin,
            props.capability,
            props.account,
            event.currentTarget.checked,
          );
        }}
      />
      {props.label}
    </label>
  );
}

function Grant(props: {
  readonly plugin: string;
  readonly grant: PluginGrant;
  readonly onChange: GrantChange;
}): JSX.Element {
  const { plugin, grant, onChange } = props;
  const label = describe(grant.capability);
  if (grant.accounts === undefined) {
    return (
      <li>
        <Toggle
          label={label}
          checked={grant.granted}
          plugin={plugin}
          capability={grant.capability}
          account={null}
          onChange={onChange}
        />
      </li>
    );
  }
  return (
    <li>
      <fieldset class="grant-accounts">
        <legend>{label}</legend>
        {grant.accounts.map((account) => (
          <Toggle
            key={account.id}
            label={account.name}
            checked={grant.granted && account.granted}
            plugin={plugin}
            capability={grant.capability}
            account={account.id}
            onChange={onChange}
          />
        ))}
      </fieldset>
    </li>
  );
}

function PluginRow(props: {
  readonly plugin: InstalledPlugin;
  readonly onGrant: GrantChange;
}): JSX.Element {
  const { plugin } = props;
  return (
    <li>
      <span class="name">{plugin.id}</span>
      <span class="hint">{text.version(plugin.version)}</span>
      <span class={`trust trust-${plugin.trust}`}>{text.trust[plugin.trust]}</span>
      {plugin.grants.length === 0 ? null : (
        <details class="permissions">
          <summary>{text.permissions}</summary>
          <p class="hint">{text.permissionsHint}</p>
          <ul>
            {plugin.grants.map((grant) => (
              <Grant
                key={grant.capability}
                plugin={plugin.id}
                grant={grant}
                onChange={props.onGrant}
              />
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

const NETWORK = 'network:';

/** A capability in the words the consent window used for it. */
const describe = (capability: string): string =>
  capability.startsWith(NETWORK)
    ? text.connectTo(capability.slice(NETWORK.length))
    : ((text.capabilities as Readonly<Record<string, string>>)[capability] ?? capability);

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
  const grant = useCallback<GrantChange>(
    (plugin, capability, account, granted) => {
      api.plugins.setGrant(plugin, capability, account, granted).then(setList, () => undefined);
    },
    [api],
  );
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
            <PluginRow key={plugin.id} plugin={plugin} onGrant={grant} />
          ))}
        </ul>
      )}
      <Activity activity={list.activity} />
    </main>
  );
}
