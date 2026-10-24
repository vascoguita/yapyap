import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, ShortcutList } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { keysOf } from '../../shared/shortcuts.ts';

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

/** Every keyboard shortcut YapYap answers to on this computer (#75). */
export function Shortcuts({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [list, setList] = useState<ShortcutList>();
  useEffect(() => {
    void api.shortcuts.list().then(setList);
  }, [api]);
  return (
    <main class="shortcuts">
      <h1>{text.title}</h1>
      {list === undefined ? null : (
        <table>
          <thead>
            <tr>
              <th scope="col">{text.action}</th>
              <th scope="col">{text.shortcut}</th>
            </tr>
          </thead>
          <tbody>
            {list.shortcuts.map((shortcut) => (
              <tr key={shortcut.id}>
                <td>{shortcut.label}</td>
                <td>
                  <Keys accelerator={shortcut.accelerator} platform={list.platform} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
