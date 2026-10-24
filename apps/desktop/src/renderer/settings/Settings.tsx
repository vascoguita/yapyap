import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ChromeApi, SettingsSnapshot, TransferResult } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import {
  SETTING_FIELDS,
  SETTINGS_SECTIONS,
  type SettingField,
  type SettingValue,
} from '../../shared/settings-fields.ts';

const text = en.settings;

type Change = (id: string, value: SettingValue) => void;

interface FieldProps {
  readonly field: SettingField;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
  /** Opens the system's folder dialog for a folder field. */
  readonly onChooseFolder?: (id: string) => void;
}

/** The field's description, then why its last change did not take effect. */
function Hint({ field, snapshot }: Omit<FieldProps, 'onChange'>): JSX.Element {
  const unavailable = snapshot.unavailable[field.id];
  return (
    <p id={`${field.id}-hint`} class="hint">
      {field.description}
      {field.restart ? ` ${text.restartNote}` : ''}
      {unavailable === undefined ? '' : ` ${unavailable}`}
      <span class="problem" aria-live="polite">
        {snapshot.problems[field.id]}
      </span>
    </p>
  );
}

function Choice(props: FieldProps & { readonly options: NonNullable<SettingField['options']> }) {
  const { field, snapshot, onChange, options } = props;
  return (
    <fieldset
      class="choice"
      aria-describedby={`${field.id}-hint`}
      disabled={snapshot.readOnly || field.id in snapshot.unavailable}
    >
      <legend>{field.label}</legend>
      {options.map(({ value, label }) => (
        <label key={String(value)}>
          <input
            type="radio"
            name={field.id}
            value={value}
            checked={snapshot.values[field.id] === value}
            onChange={() => {
              onChange(field.id, value);
            }}
          />
          {label}
        </label>
      ))}
      <Hint field={field} snapshot={snapshot} />
    </fieldset>
  );
}

/**
 * A line of text, saved on Enter or when focus leaves, so a half-typed
 * address is never checked; YapYap refuses one that does not fit.
 */
function TextField(props: FieldProps & { readonly placeholder: string }) {
  const { field, snapshot, onChange } = props;
  const save = (value: string): void => {
    if (value !== snapshot.values[field.id]) {
      onChange(field.id, value.trim());
    }
  };
  return (
    <div class="field text">
      <label for={field.id}>{field.label}</label>
      <input
        id={field.id}
        type="text"
        spellcheck={false}
        placeholder={props.placeholder}
        defaultValue={String(snapshot.values[field.id] ?? '')}
        disabled={snapshot.readOnly}
        aria-describedby={`${field.id}-hint`}
        onBlur={(event) => {
          save(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            save(event.currentTarget.value);
          }
        }}
      />
      <Hint field={field} snapshot={snapshot} />
    </div>
  );
}

/** A folder chosen in the system's dialog; the page never types a path itself. */
function FolderField(props: FieldProps) {
  const { field, snapshot, onChange, onChooseFolder } = props;
  const folder = String(snapshot.values[field.id] ?? '');
  return (
    <div class="field text">
      <span id={`${field.id}-label`}>{field.label}</span>
      <output aria-labelledby={`${field.id}-label`}>
        {folder === '' ? text.defaultFolder : folder}
      </output>
      <div class="actions">
        <button
          type="button"
          disabled={snapshot.readOnly}
          onClick={() => {
            onChooseFolder?.(field.id);
          }}
        >
          {text.chooseFolder}
        </button>
        {folder === '' ? null : (
          <button
            type="button"
            disabled={snapshot.readOnly}
            onClick={() => {
              onChange(field.id, '');
            }}
          >
            {text.useDefaultFolder}
          </button>
        )}
      </div>
      <Hint field={field} snapshot={snapshot} />
    </div>
  );
}

export function Field(props: FieldProps): JSX.Element {
  const { field, snapshot, onChange } = props;
  if (field.folder === true) {
    return <FolderField {...props} />;
  }
  if (field.options !== undefined) {
    return <Choice {...props} options={field.options} />;
  }
  if (field.text !== undefined) {
    return <TextField {...props} placeholder={field.text.placeholder} />;
  }
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
      <Hint field={field} snapshot={snapshot} />
    </div>
  );
}

function Sections(props: {
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
  readonly onChooseFolder: (id: string) => void;
}): JSX.Element[] {
  return SETTINGS_SECTIONS.flatMap(({ id, title }) => {
    // Main lists only the settings that do something on this platform.
    const fields = SETTING_FIELDS.filter(
      (field) => field.id.startsWith(`${id}.`) && field.id in props.snapshot.values,
    );
    if (fields.length === 0) {
      return [];
    }
    return [
      <section key={id} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{title}</h2>
        {fields.map((field) => (
          <Field key={field.id} field={field} {...props} />
        ))}
      </section>,
    ];
  });
}

function RestartNotice({ api }: { readonly api: ChromeApi }): JSX.Element {
  return (
    <div class="notice">
      <output>{text.restartNeeded}</output>
      <button
        type="button"
        onClick={() => {
          void api.settings.restart();
        }}
      >
        {text.restartNow}
      </button>
    </div>
  );
}

type Transfer = (operation: () => Promise<TransferResult>, onDone: () => void) => void;

/** Runs an export or import and keeps what to tell the user about it. */
function useTransfer(): readonly [string, Transfer] {
  const [status, setStatus] = useState('');
  const run: Transfer = (operation, onDone) => {
    operation().then(
      (result) => {
        setStatus(result.message);
        if (result.outcome === 'done') {
          onDone();
        }
      },
      () => {
        setStatus(text.backup.failed);
      },
    );
  };
  return [status, run];
}

function Backup(props: {
  readonly api: ChromeApi;
  readonly readOnly: boolean;
  readonly onImported: () => void;
}): JSX.Element {
  const { api, readOnly, onImported } = props;
  const [status, run] = useTransfer();
  return (
    <section aria-labelledby="backup-title">
      <h2 id="backup-title">{text.backup.title}</h2>
      <p class="hint">{text.backup.hint}</p>
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            run(api.settings.export, () => undefined);
          }}
        >
          {text.backup.export}
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            run(api.settings.import, onImported);
          }}
        >
          {text.backup.import}
        </button>
      </div>
      <output>{status}</output>
    </section>
  );
}

export function useSnapshot(
  api: ChromeApi,
): readonly [SettingsSnapshot | null | undefined, string, Change, () => void] {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = (): void => {
    api.settings.get().then(setSnapshot, () => {
      setSnapshot(null);
    });
  };
  useEffect(load, [api]);
  const change: Change = (id, value) => {
    api.settings.set(id, value).then(
      (next) => {
        setError('');
        setSnapshot(next);
      },
      () => {
        setError(text.saveFailed);
      },
    );
  };
  return [snapshot, error, change, load];
}

/** Settings is a dialog-like window, so Escape closes it. */
export function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    window.close();
  }
}

export function Settings({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [snapshot, error, change, reload] = useSnapshot(api);
  const chooseFolder = useCallback(
    (id: string) => {
      void api.settings.chooseFolder(id).then(reload);
    },
    [api, reload],
  );
  if (snapshot == null) {
    return (
      <main class="settings">
        <h1>{text.title}</h1>
        <p>{snapshot === undefined ? en.common.loading : text.unavailable}</p>
      </main>
    );
  }
  return (
    <main class="settings">
      <h1>{text.title}</h1>
      {snapshot.readOnly ? <p class="notice">{text.readOnly}</p> : null}
      {snapshot.restartPending ? <RestartNotice api={api} /> : null}
      <Sections snapshot={snapshot} onChange={change} onChooseFolder={chooseFolder} />
      <Backup api={api} readOnly={snapshot.readOnly} onImported={reload} />
      <p role="alert">{error}</p>
    </main>
  );
}
