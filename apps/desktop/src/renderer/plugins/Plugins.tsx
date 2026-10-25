import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  ChromeApi,
  InstalledPlugin,
  PluginActivity,
  PluginGrant,
  PluginSetting,
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

type SettingChange = (plugin: string, key: string, value: string | number | boolean | null) => void;

/** A value from an input, in the setting's own type; empty text means the plugin's default. */
function parsed(setting: PluginSetting, entered: string): string | number | null {
  if (entered === '') {
    return null;
  }
  return setting.type === 'string' ? entered : Number(entered);
}

interface SettingProps {
  readonly plugin: string;
  readonly setting: PluginSetting;
  readonly onChange: SettingChange;
}

const inputId = (plugin: string, key: string): string => `${plugin}|setting|${key}`;

function BooleanSetting({ plugin, setting, onChange }: SettingProps): JSX.Element {
  return (
    <input
      id={inputId(plugin, setting.key)}
      type="checkbox"
      checked={setting.value === true}
      onChange={(event) => {
        onChange(plugin, setting.key, event.currentTarget.checked);
      }}
    />
  );
}

function ChoiceSetting(
  props: SettingProps & { readonly choices: readonly (string | number)[] },
): JSX.Element {
  const { plugin, setting, onChange } = props;
  return (
    <select
      id={inputId(plugin, setting.key)}
      value={String(setting.value ?? '')}
      onChange={(event) => {
        onChange(plugin, setting.key, parsed(setting, event.currentTarget.value));
      }}
    >
      <option value="">{text.settingDefault}</option>
      {props.choices.map((choice) => (
        <option key={String(choice)} value={String(choice)}>
          {String(choice)}
        </option>
      ))}
    </select>
  );
}

/** Text and numbers are saved when the field is left, so a half-typed value is never checked. */
function TextSetting({ plugin, setting, onChange }: SettingProps): JSX.Element {
  return (
    <input
      id={inputId(plugin, setting.key)}
      type="text"
      inputMode={setting.type === 'string' ? 'text' : 'decimal'}
      spellcheck={false}
      defaultValue={String(setting.value ?? '')}
      onBlur={(event) => {
        onChange(plugin, setting.key, parsed(setting, event.currentTarget.value));
      }}
    />
  );
}

function SettingInput(props: SettingProps): JSX.Element {
  if (props.setting.type === 'boolean') {
    return <BooleanSetting {...props} />;
  }
  const choices = props.setting.enum;
  return choices === undefined ? (
    <TextSetting {...props} />
  ) : (
    <ChoiceSetting {...props} choices={choices} />
  );
}

function SettingsForm(props: {
  readonly plugin: InstalledPlugin;
  readonly onChange: SettingChange;
}): JSX.Element {
  return (
    <details class="plugin-settings">
      <summary>{text.settings}</summary>
      {props.plugin.settings.map((setting) => (
        <div class="field" key={setting.key}>
          <label htmlFor={inputId(props.plugin.id, setting.key)}>
            {setting.title ?? setting.key}
          </label>
          <SettingInput plugin={props.plugin.id} setting={setting} onChange={props.onChange} />
          {setting.description === undefined ? null : <p class="hint">{setting.description}</p>}
        </div>
      ))}
    </details>
  );
}

/** YapYap asks the user to confirm in a dialog of its own, which defaults to Cancel. */
function RemoveButton(props: {
  readonly plugin: string;
  readonly onRemove: (plugin: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class="remove"
      aria-label={text.removeLabel(props.plugin)}
      onClick={() => {
        props.onRemove(props.plugin);
      }}
    >
      {text.remove}
    </button>
  );
}

function PluginRow(props: {
  readonly plugin: InstalledPlugin;
  readonly onGrant: GrantChange;
  readonly onSetting: SettingChange;
  readonly onRemove: (plugin: string) => void;
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
      {plugin.settings.length === 0 ? null : (
        <SettingsForm plugin={plugin} onChange={props.onSetting} />
      )}
      <RemoveButton plugin={plugin.id} onRemove={props.onRemove} />
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

/** The plugin list, and how to change a grant or a setting, each answered with the new list. */
function usePluginList(api: ChromeApi) {
  const [list, setList] = useState<PluginList | null>(null);
  useEffect(() => {
    const load = (): void => {
      api.plugins.list().then(setList, () => undefined);
    };
    load();
    // A plugin installed or removed while the window is open shows up at once (#342).
    api.plugins.onChange(load);
  }, [api]);
  const setting = useCallback<SettingChange>(
    (plugin, key, value) => {
      api.plugins.setSetting(plugin, key, value).then(setList, () => undefined);
    },
    [api],
  );
  const grant = useCallback<GrantChange>(
    (plugin, capability, account, granted) => {
      api.plugins.setGrant(plugin, capability, account, granted).then(setList, () => undefined);
    },
    [api],
  );
  const remove = useCallback(
    (plugin: string) => {
      api.plugins.remove(plugin).then(setList, () => undefined);
    },
    [api],
  );
  return { list, grant, setting, remove };
}

/**
 * The installed plugins, each marked by who vouches for it, so a third-party
 * or unsigned plugin never passes for one of YapYap's own.
 */
export function Plugins({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const { list, grant, setting, remove } = usePluginList(api);
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
            <PluginRow
              key={plugin.id}
              plugin={plugin}
              onGrant={grant}
              onSetting={setting}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
      <Activity activity={list.activity} />
    </main>
  );
}
