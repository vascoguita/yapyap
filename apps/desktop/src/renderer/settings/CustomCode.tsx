import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ChromeApi, CustomCodeView } from '../../shared/api/chrome-api.ts';
import {
  ALL_ACCOUNTS,
  MAX_SNIPPET,
  NO_CUSTOM_CODE,
  type CustomCode,
  type Snippet,
} from '../../shared/custom-code.ts';
import { en } from '../../shared/messages/en.ts';
import { Group } from './Field.tsx';

const text = en.customCode;
const EMPTY: Snippet = { css: '', js: '' };

/**
 * Whether `draft` differs from `saved`. Edits only add scopes to a draft, and
 * a scope's emptied snippet counts as none, so typing and erasing changes nothing.
 */
function isChanged(draft: CustomCode, saved: CustomCode): boolean {
  return (
    draft.enabled !== saved.enabled ||
    Object.entries(draft.snippets).some(([scope, mine]) => {
      const theirs = saved.snippets[scope] ?? EMPTY;
      return mine.css !== theirs.css || mine.js !== theirs.js;
    })
  );
}

/** A code box as a stacked row: its name, the box as wide as the card, and its hint. */
function CodeRow(props: {
  readonly part: 'css' | 'js';
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const id = `custom-code-${props.part}`;
  return (
    <div class="row stacked">
      <label class="row-label" htmlFor={id}>
        {props.label}
      </label>
      <textarea
        id={id}
        class="code"
        rows={10}
        maxLength={MAX_SNIPPET}
        spellcheck={false}
        autocomplete="off"
        aria-describedby={`${id}-hint`}
        value={props.value}
        onInput={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      />
      <p class="hint" id={`${id}-hint`}>
        {props.hint}
      </p>
    </div>
  );
}

function ScopeRow(props: {
  readonly scopes: CustomCodeView['scopes'];
  readonly value: string;
  readonly onChange: (scope: string) => void;
}): JSX.Element {
  return (
    <div class="row">
      <div class="row-text">
        <label class="row-label" htmlFor="custom-code-scope">
          {text.scope}
        </label>
      </div>
      <div class="row-control">
        <select
          id="custom-code-scope"
          value={props.value}
          onChange={(event) => {
            props.onChange(event.currentTarget.value);
          }}
        >
          {props.scopes.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * The switch for all custom code, drawn as every Settings switch is. Unlike
 * theirs, it changes the draft, which applies when saved with the code.
 */
function EnabledRow(props: {
  readonly checked: boolean;
  readonly onChange: (enabled: boolean) => void;
}): JSX.Element {
  return (
    <div class="row">
      <div class="row-text">
        <label class="row-label" htmlFor="custom-code-enabled">
          {text.enabled}
        </label>
        <p id="custom-code-enabled-hint" class="hint">
          {text.enabledHint}
        </p>
      </div>
      <div class="row-control">
        <input
          id="custom-code-enabled"
          type="checkbox"
          role="switch"
          class="switch"
          checked={props.checked}
          aria-describedby="custom-code-enabled-hint"
          onChange={(event) => {
            props.onChange(event.currentTarget.checked);
          }}
        />
      </div>
    </div>
  );
}

/**
 * The draft and what it shows: CSS appears in WhatsApp as the user types,
 * and the page takes its previews back when it goes unsaved, whether the
 * user picks another page or closes the window.
 */
function useDraft(api: ChromeApi) {
  const [view, setView] = useState<CustomCodeView>();
  const [draft, setDraft] = useState<CustomCode>(NO_CUSTOM_CODE);
  const previewed = useRef(new Set<string>());
  const show = useCallback(
    (next: CustomCode, scope: string): void => {
      previewed.current.add(scope);
      const css = next.enabled ? (next.snippets[scope]?.css ?? '') : '';
      void api.customCode.preview(scope, css);
    },
    [api],
  );
  const loaded = useCallback((next: CustomCodeView): void => {
    previewed.current.clear();
    setView(next);
    setDraft(next.code);
  }, []);
  useEffect(() => {
    api.customCode.get().then(loaded, () => undefined);
    const drop = (): void => {
      for (const scope of previewed.current) {
        void api.customCode.preview(scope, null);
      }
    };
    globalThis.addEventListener('pagehide', drop);
    return () => {
      globalThis.removeEventListener('pagehide', drop);
      drop();
    };
  }, [api, loaded]);
  return { view, draft, setDraft, show, loaded };
}

interface FieldsProps {
  readonly draft: CustomCode;
  readonly scopes: CustomCodeView['scopes'];
  readonly scope: string;
  readonly onScope: (scope: string) => void;
  readonly onEnabled: (enabled: boolean) => void;
  readonly onEdit: (part: Partial<Snippet>) => void;
}

/** Which parts of `shared` hold code, and their name as one hint. */
function sharedParts(shared: Snippet): { readonly parts: ('css' | 'js')[]; readonly hint: string } {
  const parts = (['css', 'js'] as const).filter((part) => shared[part] !== '');
  const [only] = parts;
  return {
    parts,
    hint: parts.length === 2 ? text.sharedParts.both : text.sharedParts[only ?? 'css'],
  };
}

/** The code for all accounts, opened: plain text, which nothing mistakes for a field, and the way to edit it. */
function SharedCode(props: {
  readonly shared: Snippet;
  readonly parts: readonly ('css' | 'js')[];
  readonly onEdit: () => void;
}): JSX.Element {
  return (
    <div class="row stacked shared-code" id="custom-code-shared">
      {props.parts.map((part) => (
        <figure key={part}>
          <figcaption class="hint">{text[part]}</figcaption>
          <pre class="code">{props.shared[part]}</pre>
        </figure>
      ))}
      <div>
        <button type="button" onClick={props.onEdit}>
          {text.editShared}
        </button>
      </div>
    </div>
  );
}

/**
 * What the code for all accounts runs in the account picked, after that
 * account's own boxes and folded away: shown open in the card, it read as
 * more boxes to edit (#748). Opened, it is plain text, which nothing
 * mistakes for a field. Nothing shows while that
 * code is empty.
 */
function SharedRows(props: {
  readonly shared: Snippet;
  readonly onEdit: () => void;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const { parts, hint } = sharedParts(props.shared);
  if (parts.length === 0) {
    return null;
  }
  return (
    <>
      <div class="row">
        <div class="row-text">
          <span class="row-label">{text.shared}</span>
          <p class="hint">{hint}</p>
        </div>
        <div class="row-control">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="custom-code-shared"
            onClick={() => {
              setOpen(!open);
            }}
          >
            {open ? text.hide : text.show}
          </button>
        </div>
      </div>
      {open ? <SharedCode shared={props.shared} parts={parts} onEdit={props.onEdit} /> : null}
    </>
  );
}

/** An edit to each part of the snippet, kept the same across renders. */
function usePartEdits(onEdit: (part: Partial<Snippet>) => void) {
  const editCss = useCallback(
    (css: string): void => {
      onEdit({ css });
    },
    [onEdit],
  );
  const editJs = useCallback(
    (js: string): void => {
      onEdit({ js });
    },
    [onEdit],
  );
  return { editCss, editJs };
}

/** The name of the scope picked, as the code boxes' labels end with it. */
const scopeName = (scopes: CustomCodeView['scopes'], scope: string): string =>
  scope === ALL_ACCOUNTS ? text.scopeAll : (scopes.find(({ id }) => id === scope)?.label ?? '');

/**
 * The scope picker, the code for the scope picked, named by it so it is
 * plain which code is being edited, and in an account, what all accounts
 * run there too.
 */
function CodeGroup(props: Omit<FieldsProps, 'onEnabled'>): JSX.Element {
  const { onScope } = props;
  const snippet = props.draft.snippets[props.scope] ?? EMPTY;
  const name = scopeName(props.scopes, props.scope);
  const { editCss, editJs } = usePartEdits(props.onEdit);
  return (
    <Group id="custom-code-code" title={text.groups.code}>
      <ScopeRow scopes={props.scopes} value={props.scope} onChange={onScope} />
      <CodeRow
        part="css"
        label={text.cssFor({ scope: name })}
        hint={text.cssHint}
        value={snippet.css}
        onChange={editCss}
      />
      <CodeRow
        part="js"
        label={text.jsFor({ scope: name })}
        hint={text.jsHint}
        value={snippet.js}
        onChange={editJs}
      />
      {props.scope === ALL_ACCOUNTS ? null : (
        <SharedRows
          key={props.scope}
          shared={props.draft.snippets[ALL_ACCOUNTS] ?? EMPTY}
          onEdit={() => {
            onScope(ALL_ACCOUNTS);
          }}
        />
      )}
    </Group>
  );
}

function Fields(props: FieldsProps): JSX.Element {
  return (
    <>
      <Group id="custom-code-use" title={text.groups.use}>
        <EnabledRow checked={props.draft.enabled} onChange={props.onEnabled} />
      </Group>
      <CodeGroup {...props} />
    </>
  );
}

/** Edits to the draft, which clear the last save's status, and saving it. */
function useEditor(api: ChromeApi) {
  const { view, draft, setDraft, show, loaded } = useDraft(api);
  const [scope, setScope] = useState(ALL_ACCOUNTS);
  const [status, setStatus] = useState('');
  const change = (next: CustomCode, restyle: boolean): void => {
    setDraft(next);
    setStatus('');
    if (restyle) {
      show(next, scope);
    }
  };
  const edit = (part: Partial<Snippet>): void => {
    const snippet = { ...(draft.snippets[scope] ?? EMPTY), ...part };
    change({ ...draft, snippets: { ...draft.snippets, [scope]: snippet } }, part.css !== undefined);
  };
  const save = (event: SubmitEvent): void => {
    event.preventDefault();
    api.customCode.save(draft).then(
      (saved) => {
        loaded(saved);
        setStatus(text.saved);
      },
      () => {
        setStatus(text.failed);
      },
    );
  };
  const enable = (enabled: boolean): void => {
    change({ ...draft, enabled }, true);
  };
  const dirty = view !== undefined && isChanged(draft, view.code);
  return { view, draft, dirty, scope, setScope, status, enable, edit, save };
}

/** Tells Settings whether leaving now would lose an edit, and that it would not once gone. */
function useReportUnsaved(dirty: boolean, onUnsaved: (unsaved: boolean) => void): void {
  useEffect(() => {
    onUnsaved(dirty);
    return () => {
      onUnsaved(false);
    };
  }, [dirty, onUnsaved]);
}

/**
 * Settings › Custom code (#72, #710). It is off until the user turns it on,
 * and says first, plainly, that the code can read chats. Edits stay a draft
 * until saved, and Settings asks before a page change or closing loses one.
 */
export function CustomCodeSection(props: {
  readonly api: ChromeApi;
  readonly onUnsaved: (unsaved: boolean) => void;
}): JSX.Element {
  const { view, draft, dirty, scope, setScope, status, enable, edit, save } = useEditor(props.api);
  useReportUnsaved(dirty, props.onUnsaved);
  return (
    <div class="custom-code">
      <p class="notice danger">{text.warning}</p>
      <form onSubmit={save}>
        <Fields
          draft={draft}
          scopes={view?.scopes ?? []}
          scope={scope}
          onScope={setScope}
          onEnabled={enable}
          onEdit={edit}
        />
        <div class="actions">
          <output aria-live="polite">{status}</output>
          <button type="submit" disabled={view === undefined}>
            {text.save}
          </button>
        </div>
      </form>
    </div>
  );
}
