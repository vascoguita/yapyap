import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useEscapeToClose } from '../shared/escape.ts';

/** Where the user asked to go: a page, by its id, or `null` to close the window. */
type Target = string | null;

/** The page the address names, such as `#assistant`, which the assistant's menu opens at. */
const pageInAddress = (): string => globalThis.location.hash.slice(1) || 'general';

/**
 * Keeps the page in the address without a new history entry, so opening a
 * page from a menu again is a change the window hears.
 */
function keepInAddress(id: string): void {
  globalThis.history.replaceState(null, '', `#${id}`);
}

/**
 * Follows the address as the menus change it. While a page has unsaved
 * edits, the address goes back to it until the user says to discard them.
 */
function useFollowAddress(current: () => string, request: (target: Target) => void): void {
  useEffect(() => {
    const follow = (): void => {
      const next = pageInAddress();
      keepInAddress(current());
      request(next);
    };
    globalThis.addEventListener('hashchange', follow);
    return () => {
      globalThis.removeEventListener('hashchange', follow);
    };
  }, [current, request]);
}

export interface Leaving {
  readonly page: string;
  /** Whether the window is asking before it throws away an unsaved edit. */
  readonly asking: boolean;
  readonly select: (id: string) => void;
  readonly settle: (discard: boolean) => void;
}

/**
 * The question asked before leaving, and where to go once the user says to
 * discard the edit.
 */
function usePending(go: (target: Target) => void) {
  const [pending, setPending] = useState<{ readonly target: Target }>();
  const ask = useCallback((target: Target): void => {
    setPending({ target });
  }, []);
  const settle = useCallback(
    (discard: boolean): void => {
      setPending(undefined);
      if (discard && pending !== undefined) {
        go(pending.target);
      }
    },
    [pending, go],
  );
  return { asking: pending !== undefined, ask, settle };
}

/** Shows a page, or closes the window. */
function useGo(setPage: (id: string) => void): (target: Target) => void {
  return useCallback(
    (target: Target): void => {
      if (target === null) {
        window.close();
        return;
      }
      keepInAddress(target);
      setPage(target);
    },
    [setPage],
  );
}

/**
 * The page on show, and the guard on what it has not saved (#710): picking
 * another page, in the list or from a menu, and closing with Escape ask
 * first, as the Accounts window does, so an edit is never lost silently.
 */
export function useLeaving(unsaved: boolean): Leaving {
  const [page, setPage] = useState(pageInAddress);
  const go = useGo(setPage);
  const { asking, ask, settle } = usePending(go);
  // Read when asked, so a request right after typing sees that typing.
  const latest = useRef({ page, unsaved });
  latest.current = { page, unsaved };
  const request = useCallback(
    (target: Target): void => {
      if (target === latest.current.page) {
        return;
      }
      if (latest.current.unsaved) {
        ask(target);
      } else {
        go(target);
      }
    },
    [ask, go],
  );
  const current = useCallback(() => latest.current.page, []);
  useFollowAddress(current, request);
  useEscapeToClose({
    close: () => {
      request(null);
    },
  });
  return { page, asking, select: request, settle };
}
