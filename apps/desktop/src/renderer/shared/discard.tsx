import type { JSX } from 'preact';
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { en } from '../../shared/messages/en.ts';

/** Asks, in the window itself, before throwing away what the user typed. */
export function DiscardPrompt(props: {
  readonly message: string;
  readonly onSettle: (discard: boolean) => void;
}): JSX.Element {
  const { onSettle } = props;
  return (
    <div class="notice" role="alertdialog" aria-labelledby="discard-message">
      <p id="discard-message">{props.message}</p>
      <button
        type="button"
        onClick={() => {
          onSettle(false);
        }}
      >
        {en.common.keepEditing}
      </button>
      <button
        type="button"
        onClick={() => {
          onSettle(true);
        }}
      >
        {en.common.discard}
      </button>
    </div>
  );
}

/**
 * Escape closes the window, as in every YapYap window, but while `dirty` it
 * asks first, since Escape is easy to press while typing.
 */
export function useEscapeToClose(dirty: boolean): {
  /** Whether the window is asking before it closes. */
  readonly asking: boolean;
  readonly settle: (discard: boolean) => void;
} {
  const [asking, setAsking] = useState(false);
  // Read at the key press, so a key pressed right after typing sees that typing.
  const changed = useRef(dirty);
  changed.current = dirty;
  // Registered as the window renders, so Escape works from the first frame.
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      if (changed.current) {
        setAsking(true);
      } else {
        window.close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const settle = useCallback((discard: boolean): void => {
    setAsking(false);
    if (discard) {
      window.close();
    }
  }, []);
  return { asking, settle };
}
