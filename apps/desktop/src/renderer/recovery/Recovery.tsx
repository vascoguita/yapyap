import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, RecoveryProblem } from '../../shared/chrome-api.ts';

const TITLES: Readonly<Record<RecoveryProblem['kind'], string>> = {
  unsupported: 'WhatsApp says this browser is not supported',
  blank: 'WhatsApp did not finish loading',
  'load-failed': 'WhatsApp could not be reached',
  crashed: 'WhatsApp keeps stopping',
};

const ADVICE: Readonly<Record<RecoveryProblem['kind'], string>> = {
  unsupported: 'Clearing the cache usually fixes this. If it does not, check for a YapYap update.',
  blank: 'Try again. If the page stays blank, clearing the cache usually fixes it.',
  'load-failed': 'Check your internet connection, then try again.',
  crashed: 'Try again. If it keeps happening, clearing the cache usually helps.',
};

function useProblem(api: ChromeApi): RecoveryProblem | null | undefined {
  const [problem, setProblem] = useState<RecoveryProblem | null | undefined>(undefined);
  useEffect(() => {
    api.recovery.problem().then(setProblem, () => {
      setProblem(null);
    });
  }, [api]);
  return problem;
}

function useAction(): readonly [string, (action: () => Promise<void>, done: string) => void] {
  const [status, setStatus] = useState('');
  const run = (action: () => Promise<void>, done: string): void => {
    action().then(
      () => {
        setStatus(done);
      },
      () => {
        setStatus('That did not work. Please try again.');
      },
    );
  };
  return [status, run];
}

export function Recovery({ api }: { readonly api: ChromeApi }): JSX.Element {
  const problem = useProblem(api);
  const [status, run] = useAction();
  const kind = problem?.kind ?? 'blank';
  return (
    <main>
      <h1>{TITLES[kind]}</h1>
      <p>{ADVICE[kind]}</p>
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            run(api.recovery.retry, 'Retrying…');
          }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            run(api.recovery.clearCache, 'Cache cleared. Retrying…');
          }}
        >
          Clear cache and try again
        </button>
        <button
          type="button"
          onClick={() => {
            run(api.recovery.copyDiagnostics, 'Diagnostics copied to the clipboard.');
          }}
        >
          Copy diagnostics
        </button>
      </div>
      <p role="status">{status}</p>
      <p class="disclaimer">Clearing the cache keeps you logged in.</p>
    </main>
  );
}
