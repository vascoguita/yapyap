import type { JSX } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useState } from 'preact/hooks';
import type { ChromeApi, ShortcutList } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { acceleratorFromKeys } from '../../shared/shortcut-keys.ts';
import { keysOf, type ActiveShortcut } from '../../shared/shortcuts.ts';

const text = en.shortcuts;

/** Each key in its own box; macOS writes them together, other systems with plus signs. */
function Keys(props: { readonly accelerator: string; readonly platform: string }): JSX.Element {
  const keys = keysOf(props.accelerator, props.platform);
  const joiner = props.platform === 'darwin' ? '' : '+';
  return (
    <span class="keys">
      {keys.map((key, index) => (
        <span key={key}>
          {index > 0 ? joiner : null}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

/**
 * Waits for the next key press while `id` is being changed. It listens
 * before anything else, so Escape cancels rather than closing the window.
 */
function useKeyCapture(
  id: string | undefined,
  platform: string,
  onKeys: (accelerator: string | undefined) => void,
): void {
  // Listening starts as the page shows it is listening, so no key slips past.
  useLayoutEffect(() => {
    if (id === undefined) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        onKeys(undefined);
        return;
      }
      const accelerator = acceleratorFromKeys(event, platform);
      if (accelerator !== undefined) {
        onKeys(accelerator);
      }
    };
    globalThis.addEventListener('keydown', listen, true);
    return () => {
      globalThis.removeEventListener('keydown', listen, true);
    };
  }, [id, platform, onKeys]);
}

interface RowProps {
  readonly shortcut: ActiveShortcut;
  readonly platform: string;
  readonly listening: boolean;
  readonly onChange: (id: string) => void;
  readonly onReset: (id: string) => void;
}

function RowActions({ shortcut, onChange, onReset }: RowProps): JSX.Element {
  return (
    <td class="row-actions">
      <button
        type="button"
        aria-label={`${text.change}: ${shortcut.label}`}
        onClick={() => {
          onChange(shortcut.id);
        }}
      >
        {text.change}
      </button>
      {shortcut.custom ? (
        <button
          type="button"
          aria-label={`${text.reset}: ${shortcut.label}`}
          onClick={() => {
            onReset(shortcut.id);
          }}
        >
          {text.reset}
        </button>
      ) : null}
    </td>
  );
}

function Row(props: RowProps): JSX.Element {
  return (
    <tr>
      <td>{props.shortcut.label}</td>
      <td>
        {props.listening ? (
          <output>{text.press}</output>
        ) : (
          <Keys accelerator={props.shortcut.accelerator} platform={props.platform} />
        )}
      </td>
      <RowActions {...props} />
    </tr>
  );
}

function Table(props: {
  readonly list: ShortcutList;
  readonly listening: string | undefined;
  readonly onChange: (id: string) => void;
  readonly onReset: (id: string) => void;
}): JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{text.action}</th>
          <th scope="col">{text.shortcut}</th>
          <td />
        </tr>
      </thead>
      <tbody>
        {props.list.shortcuts.map((shortcut) => (
          <Row
            key={shortcut.id}
            shortcut={shortcut}
            platform={props.list.platform}
            listening={props.listening === shortcut.id}
            onChange={props.onChange}
            onReset={props.onReset}
          />
        ))}
      </tbody>
    </table>
  );
}

/** The shortcuts as main has them, and the last change's problem, if any. */
function useShortcuts(api: ChromeApi) {
  const [list, setList] = useState<ShortcutList>();
  const [problem, setProblem] = useState('');
  useEffect(() => {
    void api.shortcuts.list().then(setList);
  }, [api]);
  const apply = useCallback(
    (id: string, accelerator: string | null) => {
      void api.shortcuts.set(id, accelerator).then((change) => {
        setList(change);
        setProblem(change.problem);
      });
    },
    [api],
  );
  return { list, problem, apply };
}

/** Every keyboard shortcut YapYap answers to on this computer, each one changeable (#75). */
export function Shortcuts({ api }: { readonly api: ChromeApi }): JSX.Element {
  const { list, problem, apply } = useShortcuts(api);
  const [listening, setListening] = useState<string>();
  const onKeys = useCallback(
    (accelerator: string | undefined) => {
      if (listening !== undefined && accelerator !== undefined) {
        apply(listening, accelerator);
      }
      setListening(undefined);
    },
    [apply, listening],
  );
  const reset = useCallback(
    (id: string) => {
      apply(id, null);
    },
    [apply],
  );
  useKeyCapture(listening, list?.platform ?? '', onKeys);
  return (
    <main class="shortcuts">
      <h1>{text.title}</h1>
      <p role="alert">{problem}</p>
      {list === undefined ? null : (
        <Table list={list} listening={listening} onChange={setListening} onReset={reset} />
      )}
    </main>
  );
}
