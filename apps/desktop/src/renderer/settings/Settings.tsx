import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, SettingsSnapshot, TransferResult } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { SETTING_FIELDS } from '../../shared/settings-fields.ts';
import { DiscardPrompt } from '../shared/discard.tsx';
import { AgentsSection } from './Agents.tsx';
import { AssistantSection } from './Assistant.tsx';
import { CustomCodeSection } from './CustomCode.tsx';
import { Field, Group, type Change } from './Field.tsx';
import { ShortcutsSection } from './Shortcuts.tsx';
import { useLeaving } from './leaving.ts';
import { SpellingSection } from './Spelling.tsx';
import { Icon } from '../shared/icons.tsx';
import {
  BACKUP_PAGE,
  isDimmed,
  isShown,
  shownPages,
  type SettingsGroup,
  type SettingsPage,
} from './pages.ts';

const text = en.settings;

interface PageProps {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
  readonly reload: () => void;
  /** Whether the page holds edits that leaving it would lose. */
  readonly onUnsaved: (unsaved: boolean) => void;
}

/** A group's settings that show on this platform and in this state; none hides the group. */
function GroupOf(props: PageProps & { readonly group: SettingsGroup }): JSX.Element | null {
  const { api, group, snapshot, onChange, reload } = props;
  const { values } = snapshot;
  const fields = SETTING_FIELDS.filter((field) => group.ids.includes(field.id))
    .filter((field) => isShown(field.id, values))
    .sort((a, b) => group.ids.indexOf(a.id) - group.ids.indexOf(b.id));
  if (fields.length === 0) {
    return null;
  }
  const chooseFolder = (id: string): void => {
    void api.settings.chooseFolder(id).then(reload);
  };
  return (
    <Group id={group.id} title={group.title}>
      {fields.map((field) => (
        <Field
          key={field.id}
          field={field}
          snapshot={snapshot}
          onChange={onChange}
          onChooseFolder={chooseFolder}
          dimmed={isDimmed(field.id, values)}
        />
      ))}
    </Group>
  );
}

function PageBody(props: PageProps & { readonly page: SettingsPage }): JSX.Element {
  const { page } = props;
  switch (page.own) {
    case 'spelling':
      return <SpellingSection {...props} />;
    case 'shortcuts':
      return <ShortcutsSection api={props.api} />;
    case 'assistant':
      return <AssistantSection {...props} />;
    case 'agents':
      return <AgentsSection {...props} />;
    case 'customCode':
      return <CustomCodeSection api={props.api} onUnsaved={props.onUnsaved} />;
    case 'backup':
      return <Backup api={props.api} onImported={props.reload} />;
    default:
      return (
        <>
          {page.groups.map((group) => (
            <GroupOf key={group.id} {...props} group={group} />
          ))}
        </>
      );
  }
}

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

interface NavProps {
  readonly pages: readonly SettingsPage[];
  readonly current: string;
  readonly onSelect: (id: string) => void;
}

/** Up and Down move to the page before or after, ending at the first and last, as a list box does. */
function arrowKeys({ pages, current, onSelect }: NavProps): (event: KeyboardEvent) => void {
  return (event) => {
    const step = STEPS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const next = pages[pages.findIndex(({ id }) => id === current) + step];
    if (next !== undefined) {
      onSelect(next.id);
      document.getElementById(`page-${next.id}`)?.focus();
    }
  };
}

/** The pages, one at a time, in a list beside the page. */
function SectionNav(props: NavProps): JSX.Element {
  const { pages, current, onSelect } = props;
  const onKeyDown = arrowKeys(props);
  return (
    <nav aria-label={text.sectionsLabel} class="settings-nav">
      <ul>
        {pages.map((page) => (
          <li key={page.id} class={page.apart === true ? 'apart' : undefined}>
            <button
              type="button"
              id={`page-${page.id}`}
              aria-current={page.id === current ? 'page' : undefined}
              onKeyDown={onKeyDown}
              onClick={() => {
                onSelect(page.id);
              }}
            >
              <Icon name={page.icon} />
              {page.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** In a narrow window, the pages as a list above the page instead of beside it. */
function SectionSelect(props: {
  readonly pages: readonly SettingsPage[];
  readonly current: string;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <div class="section-select">
      <select
        aria-label={text.sectionsLabel}
        value={props.current}
        onChange={(event) => {
          props.onSelect(event.currentTarget.value);
        }}
      >
        {props.pages.map(({ id, title }) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </div>
  );
}

function RestartBar({ api }: { readonly api: ChromeApi }): JSX.Element {
  return (
    <div class="restart-bar">
      <Icon name="restart" />
      <output>{text.restartNeeded}</output>
      <button
        type="button"
        class="primary"
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

/** A row that does one thing, with its button on the right. */
function ActionRow(props: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly button: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <div class="row">
      <div class="row-text">
        <span id={`${props.id}-label`} class="row-label">
          {props.label}
        </span>
        <p id={`${props.id}-hint`} class="hint">
          {props.hint}
        </p>
      </div>
      <div class="row-control">
        <button type="button" aria-describedby={`${props.id}-hint`} onClick={props.onClick}>
          {props.button}
        </button>
      </div>
    </div>
  );
}

function Backup(props: { readonly api: ChromeApi; readonly onImported: () => void }): JSX.Element {
  const { api, onImported } = props;
  const [status, run] = useTransfer();
  const words = text.backup;
  return (
    <>
      <Group id="settings-file" title={text.groups.settingsFile}>
        <ActionRow
          id="backup-export"
          label={words.exportLabel}
          hint={words.exportHint}
          button={words.export}
          onClick={() => {
            run(api.settings.export, () => undefined);
          }}
        />
        <ActionRow
          id="backup-import"
          label={words.importLabel}
          hint={words.importHint}
          button={words.import}
          onClick={() => {
            run(api.settings.import, onImported);
          }}
        />
      </Group>
      <output class="group-note">{status}</output>
    </>
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

/** Settings while they load, or once they could not be read. */
function NoSettings({ loading }: { readonly loading: boolean }): JSX.Element {
  return (
    <main class="settings-pane" aria-busy={loading}>
      <div class="settings-content">
        <h1>{text.title}</h1>
        <p>{loading ? en.common.loading : text.unavailable}</p>
      </div>
    </main>
  );
}

/**
 * Settings: the pages in a list beside the open one, which keeps its place
 * while the window stays open; a change that needs a restart offers one at
 * the bottom. A page with unsaved edits asks before the user leaves it.
 */
export function Settings({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [snapshot, error, change, reload] = useSnapshot(api);
  const [unsaved, setUnsaved] = useState(false);
  const leaving = useLeaving(unsaved);
  if (snapshot == null) {
    return <NoSettings loading={snapshot === undefined} />;
  }
  const pages = [...shownPages(snapshot), BACKUP_PAGE] as const;
  // The first page opens until another is picked, and stands in for one this platform lacks.
  const page = pages.find(({ id }) => id === leaving.page) ?? pages[0];
  return (
    <div class="settings-window">
      <SectionNav pages={pages} current={page.id} onSelect={leaving.select} />
      <main class="settings-pane" aria-labelledby="page-title">
        <SectionSelect pages={pages} current={page.id} onSelect={leaving.select} />
        <div class={`settings-content page-${page.id}`}>
          <h1 id="page-title">{page.title}</h1>
          {page.intro === undefined ? null : <p class="intro">{page.intro}</p>}
          {leaving.asking ? (
            <DiscardPrompt message={en.customCode.discard} onSettle={leaving.settle} />
          ) : null}
          <PageBody
            key={page.id}
            api={api}
            snapshot={snapshot}
            onChange={change}
            reload={reload}
            onUnsaved={setUnsaved}
            page={page}
          />
          <p role="alert">{error}</p>
        </div>
        {snapshot.restartPending ? <RestartBar api={api} /> : null}
      </main>
    </div>
  );
}
