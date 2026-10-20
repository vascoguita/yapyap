import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, SettingsSnapshot } from '../../shared/chrome-api.ts';
import {
  SETTING_FIELDS,
  SETTINGS_SECTIONS,
  type SettingField,
  type SettingValue,
} from '../../shared/settings-fields.ts';

type Change = (id: string, value: SettingValue) => void;

export function Toggle(props: {
  readonly field: SettingField;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element {
  const { field, snapshot, onChange } = props;
  const hint = `${field.id}-hint`;
  return (
    <div class="field">
      <input
        id={field.id}
        type="checkbox"
        checked={snapshot.values[field.id] === true}
        disabled={snapshot.readOnly}
        aria-describedby={hint}
        onChange={(event) => {
          onChange(field.id, event.currentTarget.checked);
        }}
      />
      <label for={field.id}>{field.label}</label>
      <p id={hint} class="hint">
        {field.description}
        {field.restart ? ' Takes effect after a restart.' : ''}
      </p>
    </div>
  );
}

function Sections(props: {
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element[] {
  return SETTINGS_SECTIONS.flatMap(({ id, title }) => {
    const fields = SETTING_FIELDS.filter((field) => field.id.startsWith(`${id}.`));
    if (fields.length === 0) return [];
    return [
      <section key={id} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{title}</h2>
        {fields.map((field) => (
          <Toggle key={field.id} field={field} {...props} />
        ))}
      </section>,
    ];
  });
}

function RestartNotice({ api }: { readonly api: ChromeApi }): JSX.Element {
  return (
    <div class="notice" role="status">
      <p>Restart YapYap to apply your changes.</p>
      <button
        type="button"
        onClick={() => {
          void api.settings.restart();
        }}
      >
        Restart now
      </button>
    </div>
  );
}

function useSnapshot(
  api: ChromeApi,
): readonly [SettingsSnapshot | null | undefined, string, Change] {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    api.settings.get().then(setSnapshot, () => {
      setSnapshot(null);
    });
  }, [api]);
  const change: Change = (id, value) => {
    api.settings.set(id, value).then(
      (next) => {
        setError('');
        setSnapshot(next);
      },
      () => {
        setError('Could not save that setting.');
      },
    );
  };
  return [snapshot, error, change];
}

/** Settings is a dialog-like window, so Escape closes it. */
export function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') window.close();
}

export function Settings({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [snapshot, error, change] = useSnapshot(api);
  if (snapshot == null)
    return (
      <main class="settings">
        <h1>Settings</h1>
        <p>{snapshot === undefined ? 'Loading…' : 'Settings are unavailable.'}</p>
      </main>
    );
  return (
    <main class="settings">
      <h1>Settings</h1>
      {snapshot.readOnly ? (
        <p class="notice">
          These settings were saved by a newer version of YapYap, so they cannot be changed here.
        </p>
      ) : null}
      {snapshot.restartPending ? <RestartNotice api={api} /> : null}
      <Sections snapshot={snapshot} onChange={change} />
      <p role="alert">{error}</p>
    </main>
  );
}
