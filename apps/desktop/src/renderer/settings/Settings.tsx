import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ChromeApi, SettingsSnapshot, TransferResult } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { SETTING_FIELDS, SETTINGS_SECTIONS } from '../../shared/settings-fields.ts';
import { AssistantSection } from './Assistant.tsx';
import { Field, type Change } from './Field.tsx';

const text = en.settings;

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
    // The assistant's section is its own, with more than fields (ADR 0017).
    if (fields.length === 0 || id === 'assistant') {
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
      <main class="settings" aria-busy={snapshot === undefined}>
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
      {'assistant.enabled' in snapshot.values ? (
        <AssistantSection api={api} snapshot={snapshot} onChange={change} />
      ) : null}
      <Sections snapshot={snapshot} onChange={change} onChooseFolder={chooseFolder} />
      <Backup api={api} readOnly={snapshot.readOnly} onImported={reload} />
      <p role="alert">{error}</p>
    </main>
  );
}
