import { useEffect, useRef, useState } from 'preact/hooks';
import type { DictionaryState } from '../../shared/api/chrome-api.ts';

/** What a language's row shows about its dictionary: nothing once it settles as ready. */
export type ShownDictionary = 'downloading' | 'downloaded' | 'failed';

/** A download shows at least this long, so even a quick one is seen (#741). */
export const MIN_DOWNLOADING_MS = 800;

/** How long "Downloaded" shows once a download ends, before the row goes quiet. */
export const DOWNLOADED_MS = 4000;

/** When each language's download was first seen, and when it was seen to end. */
interface Seen {
  readonly started: Map<string, number>;
  readonly ended: Map<string, number>;
}

interface Shown {
  readonly shown: ShownDictionary | undefined;
  /** When what shows next changes. */
  readonly until?: number;
}

/** What a download that started at `started` shows at `now`. */
function sinceStart(
  language: string,
  state: DictionaryState,
  seen: Seen,
  now: number,
  started: number,
): Shown {
  if (state === 'downloading' || now < started + MIN_DOWNLOADING_MS) {
    return { shown: 'downloading' as const, until: started + MIN_DOWNLOADING_MS };
  }
  const ended = seen.ended.get(language) ?? now;
  seen.ended.set(language, ended);
  return now < ended + DOWNLOADED_MS
    ? { shown: 'downloaded' as const, until: ended + DOWNLOADED_MS }
    : { shown: undefined };
}

/** What one language shows at `now`, and when that next changes, if it does. */
function shownAt(language: string, state: DictionaryState, seen: Seen, now: number): Shown {
  if (state === 'failed') {
    seen.started.delete(language);
    seen.ended.delete(language);
    return { shown: 'failed' };
  }
  const started = seen.started.get(language) ?? (state === 'downloading' ? now : undefined);
  if (started === undefined) {
    // Ready from the start: it was on disk already.
    return { shown: undefined };
  }
  seen.started.set(language, started);
  return sinceStart(language, state, seen, now, started);
}

/**
 * What each language's row shows about its dictionary (#741): a download
 * for at least {@link MIN_DOWNLOADING_MS}, then "Downloaded" for
 * {@link DOWNLOADED_MS}, then nothing; a dictionary that was there already
 * shows nothing at all, and one that failed shows so until it is tried
 * again. The page renders again when the next of these changes is due.
 */
export function useShownDictionaries(
  states: Readonly<Record<string, DictionaryState>>,
): Record<string, ShownDictionary> {
  const seen = useRef<Seen>({ started: new Map(), ended: new Map() });
  const [, setTick] = useState(0);
  const now = Date.now();
  const shown: Record<string, ShownDictionary> = {};
  let next = Infinity;
  for (const [language, state] of Object.entries(states)) {
    const { shown: what, until } = shownAt(language, state, seen.current, now);
    if (what !== undefined) {
      shown[language] = what;
    }
    next = Math.min(next, until ?? Infinity);
  }
  useEffect(() => {
    if (next === Infinity) {
      return undefined;
    }
    const timer = setTimeout(
      () => {
        setTick((tick) => tick + 1);
      },
      Math.max(0, next - Date.now()),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [next]);
  return shown;
}
