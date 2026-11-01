import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, RecoveryProblem } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.recovery;

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
        setStatus(text.failed);
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
      <h1>{text.problems[kind].title}</h1>
      <p>{text.problems[kind].advice}</p>
      <div class="actions">
        <button
          type="button"
          class="primary"
          onClick={() => {
            run(api.recovery.retry, text.retrying);
          }}
        >
          {text.retry}
        </button>
        <button
          type="button"
          onClick={() => {
            run(api.recovery.clearCache, text.cacheCleared);
          }}
        >
          {text.clearCache}
        </button>
        <button
          type="button"
          onClick={() => {
            run(api.recovery.copyDiagnostics, text.diagnosticsCopied);
          }}
        >
          {text.copyDiagnostics}
        </button>
      </div>
      <output>{status}</output>
      <p class="disclaimer">{text.keepsLogin}</p>
    </main>
  );
}
