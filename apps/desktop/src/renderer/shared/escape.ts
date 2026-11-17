import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';

function closeWindow(): void {
  window.close();
}

interface EscapeOptions {
  /**
   * Whether closing now would lose what the user typed. Escape is easy to
   * press while typing, so then it asks first.
   */
  readonly dirty?: boolean;
  /** How the window closes, when that means more than closing it. */
  readonly close?: () => void;
}

/**
 * Escape closes the window, as in every YapYap window. Anything that needs
 * the key first, such as a key-capture field or the discard prompt, listens
 * on the window while capturing and stops it there.
 */
export function useEscapeToClose({ dirty = false, close = closeWindow }: EscapeOptions = {}): {
  /** Whether the window is asking before it closes. */
  readonly asking: boolean;
  readonly settle: (discard: boolean) => void;
} {
  const [asking, setAsking] = useState(false);
  // Read at the key press, so a key pressed right after typing sees that typing.
  const latest = useRef({ dirty, close });
  latest.current = { dirty, close };
  // Registered as the window renders, so Escape works from the first frame.
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      if (latest.current.dirty) {
        setAsking(true);
      } else {
        latest.current.close();
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
      latest.current.close();
    }
  }, []);
  return { asking, settle };
}
