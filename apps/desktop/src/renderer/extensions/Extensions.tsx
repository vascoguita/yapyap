import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type {
  ChromeApi,
  InstalledExtension,
  ExtensionActivity,
  ExtensionGrant,
  ExtensionSetting,
  ExtensionList,
} from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { Marketplace } from './Marketplace.tsx';

const text = en.extensions;

type GrantChange = (
  extension: string,
  capability: string,
  account: string | null,
  granted: boolean,
) => void;

function Toggle(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly extension: string;
  readonly capability: string;
  readonly account: string | null;
  readonly onChange: GrantChange;
}): JSX.Element {
  const id = [props.extension, props.capability, props.account ?? ''].join('|');
  return (
    <label class="grant" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => {
          props.onChange(
            props.extension,
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
  readonly extension: string;
  readonly grant: ExtensionGrant;
  readonly onChange: GrantChange;
}): JSX.Element {
  const { extension, grant, onChange } = props;
  const label = describe(grant.capability);
  if (grant.accounts === undefined) {
    return (
      <li>
        <Toggle
          label={label}
          checked={grant.granted}
          extension={extension}
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
            extension={extension}
            capability={grant.capability}
            account={account.id}
            onChange={onChange}
          />
        ))}
      </fieldset>
    </li>
  );
}

/** Saves a setting; resolves with whether YapYap accepted it. */
type SettingChange = (
  extension: string,
  key: string,
  value: string | number | boolean | null,
) => Promise<boolean>;

/** A value from an input, in the setting's own type; empty text means the extension's default. */
function parsed(setting: ExtensionSetting, entered: string): string | number | null {
  if (entered === '') {
    return null;
  }
  return setting.type === 'string' ? entered : Number(entered);
}

interface SettingProps {
  readonly extension: string;
  readonly setting: ExtensionSetting;
  readonly onChange: SettingChange;
}

const inputId = (extension: string, key: string): string => `${extension}|setting|${key}`;

function BooleanSetting({ extension, setting, onChange }: SettingProps): JSX.Element {
  return (
    <input
      id={inputId(extension, setting.key)}
      type="checkbox"
      checked={setting.value === true}
      onChange={(event) => {
        void onChange(extension, setting.key, event.currentTarget.checked);
      }}
    />
  );
}

function ChoiceSetting(
  props: SettingProps & { readonly choices: readonly (string | number)[] },
): JSX.Element {
  const { extension, setting, onChange } = props;
  return (
    <select
      id={inputId(extension, setting.key)}
      value={String(setting.value ?? '')}
      onChange={(event) => {
        void onChange(extension, setting.key, parsed(setting, event.currentTarget.value));
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

/**
 * Text and numbers are saved on Enter, when the field is left, and when the
 * window closes, so a half-typed value is never checked and a typed one is
 * never lost (#431). The field says whether YapYap kept it.
 */
function TextSetting({ extension, setting, onChange }: SettingProps): JSX.Element {
  const [kept, setKept] = useState<boolean | null>(null);
  const stored = String(setting.value ?? '');
  const typed = useRef(stored);
  const save = useCallback((): void => {
    const entered = typed.current;
    if (entered !== stored) {
      void onChange(extension, setting.key, parsed(setting, entered)).then(setKept);
    }
  }, [extension, setting, stored, onChange]);
  useEffect(() => {
    globalThis.addEventListener('pagehide', save);
    return () => {
      globalThis.removeEventListener('pagehide', save);
    };
  }, [save]);
  return (
    <>
      <input
        id={inputId(extension, setting.key)}
        type="text"
        inputMode={setting.type === 'string' ? 'text' : 'decimal'}
        spellcheck={false}
        defaultValue={stored}
        onInput={(event) => {
          typed.current = event.currentTarget.value;
          setKept(null);
        }}
        onChange={save}
      />
      {kept === null ? null : (
        <output class="saved">{kept ? text.settingSaved : text.settingRefused}</output>
      )}
    </>
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
  readonly extension: InstalledExtension;
  readonly onChange: SettingChange;
}): JSX.Element {
  return (
    <details class="extension-settings">
      <summary>{text.settings}</summary>
      {props.extension.settings.map((setting) => (
        <div class="field" key={setting.key}>
          <label htmlFor={inputId(props.extension.id, setting.key)}>
            {setting.title ?? setting.key}
          </label>
          <SettingInput
            extension={props.extension.id}
            setting={setting}
            onChange={props.onChange}
          />
          {setting.description === undefined ? null : <p class="hint">{setting.description}</p>}
        </div>
      ))}
    </details>
  );
}

/** YapYap asks the user to confirm in a dialog of its own, which defaults to Cancel. */
function RemoveButton(props: {
  readonly extension: InstalledExtension;
  readonly onRemove: (extension: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class="remove"
      aria-label={text.removeLabel({ extension: props.extension.name })}
      onClick={() => {
        props.onRemove(props.extension.id);
      }}
    >
      {text.remove}
    </button>
  );
}

function ExtensionRow(props: {
  readonly extension: InstalledExtension;
  readonly onGrant: GrantChange;
  readonly onSetting: SettingChange;
  readonly onRemove: (extension: string) => void;
}): JSX.Element {
  const { extension } = props;
  return (
    <li>
      <span class="name">{extension.name}</span>
      <span class={`trust trust-${extension.trust}`}>{text.trust[extension.trust]}</span>
      <span class="hint id">
        {extension.id} · {text.version({ version: extension.version })}
      </span>
      {extension.pulled === null ? null : (
        <p class="warning">{text.pulled({ reason: extension.pulled })}</p>
      )}
      {extension.grants.length === 0 ? null : (
        <details class="permissions">
          <summary>{text.permissions}</summary>
          <p class="hint">{text.permissionsHint}</p>
          <ul>
            {extension.grants.map((grant) => (
              <Grant
                key={grant.capability}
                extension={extension.id}
                grant={grant}
                onChange={props.onGrant}
              />
            ))}
          </ul>
        </details>
      )}
      {extension.settings.length === 0 ? null : (
        <SettingsForm extension={extension} onChange={props.onSetting} />
      )}
      <RemoveButton extension={extension} onRemove={props.onRemove} />
    </li>
  );
}

const NETWORK = 'network:';

/** A capability in the words the consent window used for it. */
const describe = (capability: string): string =>
  capability.startsWith(NETWORK)
    ? text.connectTo({ host: capability.slice(NETWORK.length) })
    : ((text.capabilities as Readonly<Record<string, string>>)[capability] ?? capability);

function Activity(props: {
  readonly activity: readonly ExtensionActivity[];
  readonly extensions: readonly InstalledExtension[];
}): JSX.Element {
  const { activity } = props;
  // A removed extension keeps its entries, under its ID.
  const nameOf = (id: string): string =>
    props.extensions.find((extension) => extension.id === id)?.name ?? id;
  return (
    <section aria-labelledby="activity-title">
      <h2 id="activity-title">{text.activity.title}</h2>
      <p class="hint">{text.activity.hint}</p>
      {activity.length === 0 ? (
        <p>{text.activity.empty}</p>
      ) : (
        <ul class="activity">
          {activity.map((entry) => (
            <li key={`${entry.time}|${entry.extension}|${entry.method}|${entry.outcome}`}>
              <time dateTime={entry.time}>{new Date(entry.time).toLocaleString()}</time>
              <span class="name">{nameOf(entry.extension)}</span>
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
 * The list YapYap last answered with, and what went wrong last. Each answer
 * replaces what the window last said, so an old failure does not linger.
 */
function useAnswers() {
  const [list, setList] = useState<ExtensionList | null>(null);
  const [problem, setProblem] = useState('');
  const settled = useCallback((updated: ExtensionList): void => {
    setList(updated);
    setProblem('');
  }, []);
  const failed = useCallback((): void => {
    setProblem(text.changeFailed);
  }, []);
  return { list, problem, setProblem, settled, failed };
}

/** The extension list, and how to change a grant or a setting, each answered with the new list. */
function useExtensionList(api: ChromeApi) {
  const { list, problem, setProblem, settled, failed } = useAnswers();
  useEffect(() => {
    const load = (): void => {
      api.extensions.list().then(settled, () => {
        setProblem(text.listFailed);
      });
    };
    load();
    // An extension installed or removed while the window is open shows up at once (#342).
    api.extensions.onChange(load);
  }, [api, settled, setProblem]);
  const setting = useCallback<SettingChange>(
    (extension, key, value) =>
      api.extensions.setSetting(extension, key, value).then(
        (updated) => {
          settled(updated);
          return true;
        },
        () => false,
      ),
    [api, settled],
  );
  const grant = useCallback<GrantChange>(
    (extension, capability, account, granted) => {
      api.extensions.setGrant(extension, capability, account, granted).then(settled, failed);
    },
    [api, settled, failed],
  );
  const remove = useCallback(
    (extension: string) => {
      api.extensions.remove(extension).then(settled, failed);
    },
    [api, settled, failed],
  );
  return { list, problem, grant, setting, remove };
}

type Tab = 'installed' | 'marketplace';
const TABS: readonly Tab[] = ['installed', 'marketplace'];

/** The window's two tabs, switched by click or with the arrow keys, as tab lists are. */
function Tabs(props: { readonly tab: Tab; readonly onChange: (tab: Tab) => void }): JSX.Element {
  const label = {
    installed: text.marketplace.installedTab,
    marketplace: text.marketplace.marketplaceTab,
  };
  return (
    <div role="tablist" aria-label={text.marketplace.tabsLabel}>
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`tab-${tab}`}
          aria-selected={props.tab === tab}
          aria-controls="tab-panel"
          tabIndex={props.tab === tab ? 0 : -1}
          onClick={() => {
            props.onChange(tab);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              const next = tab === 'installed' ? 'marketplace' : 'installed';
              props.onChange(next);
              document.getElementById(`tab-${next}`)?.focus();
            }
          }}
        >
          {label[tab]}
        </button>
      ))}
    </div>
  );
}

/**
 * The extensions window: the installed extensions, each marked by who vouches for
 * it, so a third-party or unsigned extension never passes for one of YapYap's
 * own, and the marketplace (ADR 0014).
 */
export function Extensions({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const [tab, setTab] = useState<Tab>('installed');
  const browse = useCallback(() => {
    setTab('marketplace');
    document.getElementById('tab-marketplace')?.focus();
  }, []);
  return (
    <main class="extensions">
      <h1>{text.title}</h1>
      <Tabs tab={tab} onChange={setTab} />
      <section role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'installed' ? (
          <Installed api={api} onBrowse={browse} />
        ) : (
          <Marketplace api={api} />
        )}
      </section>
    </main>
  );
}

/** With nothing installed, the way to the Marketplace is right there. */
function Empty({ onBrowse }: { readonly onBrowse: () => void }): JSX.Element {
  return (
    <div class="empty">
      <p>{text.empty}</p>
      <button type="button" class="primary" onClick={onBrowse}>
        {text.browse}
      </button>
    </div>
  );
}

function Installed(props: { readonly api: ChromeApi; readonly onBrowse: () => void }): JSX.Element {
  const { list, problem, grant, setting, remove } = useExtensionList(props.api);
  return (
    <>
      <p role="alert">{problem}</p>
      {list === null ? null : (
        <InstalledList list={list} {...{ grant, setting, remove }} onBrowse={props.onBrowse} />
      )}
    </>
  );
}

function InstalledList(props: {
  readonly list: ExtensionList;
  readonly grant: GrantChange;
  readonly setting: SettingChange;
  readonly remove: (extension: string) => void;
  readonly onBrowse: () => void;
}): JSX.Element {
  const { list, grant, setting, remove } = props;
  return (
    <>
      <p class="hint">{text.hint}</p>
      {list.developerMode ? <p class="warning">{text.developerMode}</p> : null}
      {list.extensions.length === 0 ? (
        <Empty onBrowse={props.onBrowse} />
      ) : (
        <ul class="extension-list">
          {list.extensions.map((extension) => (
            <ExtensionRow
              key={extension.id}
              extension={extension}
              onGrant={grant}
              onSetting={setting}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
      <Activity activity={list.activity} extensions={list.extensions} />
    </>
  );
}
