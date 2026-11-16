import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { en } from '../../shared/messages/en.ts';

/**
 * Focuses the safe answer and makes Escape choose it. Capturing on the
 * window runs before the page's own Escape handler on the document.
 */
function useKeepEditing(onSettle: (discard: boolean) => void) {
  const keep = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    keep.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onSettle(false);
      }
    };
    globalThis.addEventListener('keydown', onKey, true);
    return () => {
      globalThis.removeEventListener('keydown', onKey, true);
    };
  }, [onSettle]);
  return keep;
}

/**
 * Asks, in the window itself, before throwing away what the user typed. Like
 * any dialog it takes the focus, on the safe answer, and Escape keeps editing
 * rather than asking to close again.
 */
export function DiscardPrompt(props: {
  readonly message: string;
  readonly onSettle: (discard: boolean) => void;
}): JSX.Element {
  const { onSettle } = props;
  const keep = useKeepEditing(onSettle);
  return (
    <div
      class="notice"
      role="alertdialog"
      aria-labelledby="discard-message"
      aria-describedby="discard-message"
    >
      <p id="discard-message">{props.message}</p>
      <button
        ref={keep}
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
