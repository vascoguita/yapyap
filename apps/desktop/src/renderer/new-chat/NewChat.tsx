import type { JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import type { ChromeApi } from '../../shared/chrome-api.ts';
import { parseInternationalNumber } from '../../shared/phone-number.ts';

function NumberField(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div class="field">
      <label htmlFor="number">Phone number, with the country code</label>
      <input
        id="number"
        type="tel"
        autocomplete="off"
        placeholder="+44 7700 900123"
        value={props.value}
        aria-describedby="number-hint"
        onInput={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      />
      <p id="number-hint" class="hint">
        Start with + or 00 and the country code. YapYap does not save the number.
      </p>
    </div>
  );
}

function Actions({ canOpen }: { readonly canOpen: boolean }): JSX.Element {
  return (
    <div class="actions">
      <button
        type="button"
        onClick={() => {
          window.close();
        }}
      >
        Cancel
      </button>
      <button type="submit" disabled={!canOpen}>
        Open Chat
      </button>
    </div>
  );
}

/**
 * Opens a chat with a number that is not in the user's contacts. The number
 * goes to WhatsApp's own chat link and is never saved.
 */
export function NewChat({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [number, setNumber] = useState('');
  const [failed, setFailed] = useState(false);
  const valid = parseInternationalNumber(number) !== undefined;
  const change = useCallback((value: string): void => {
    setNumber(value);
    setFailed(false);
  }, []);
  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    void api.chat.openNumber(number).then((opened) => {
      if (opened) {
        window.close();
      } else {
        setFailed(true);
      }
    });
  };
  return (
    <main class="new-chat">
      <h1>New chat</h1>
      <form onSubmit={submit}>
        <NumberField value={number} onChange={change} />
        {failed ? <output>WhatsApp is not ready to open the chat. Try again.</output> : null}
        <Actions canOpen={valid} />
      </form>
    </main>
  );
}
