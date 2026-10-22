import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AboutInfo, ChromeApi } from '../../shared/chrome-api.ts';

export const LINKS = [
  { label: 'Website', href: 'https://yapyap.guita.org/' },
  { label: 'Source code', href: 'https://github.com/vascoguita/yapyap' },
  { label: 'Report a problem', href: 'https://github.com/vascoguita/yapyap/issues' },
  { label: 'Privacy', href: 'https://yapyap.guita.org/privacy' },
  { label: 'Sponsor', href: 'https://github.com/sponsors/vascoguita' },
] as const;

export const SUPPORTER = { name: 'Ensita', href: 'https://www.ensita.org/' } as const;

type Load =
  { readonly state: 'loading' | 'failed' } | { readonly state: 'ready'; readonly info: AboutInfo };

function Details({ info }: { readonly info: AboutInfo }): JSX.Element {
  const rows: readonly (readonly [string, string])[] = [
    ['Version', `${info.version} (${info.channel})`],
    ['Electron', info.electron],
    ['Chromium', info.chromium],
    ['Node.js', info.node],
    ['Operating system', info.os],
    ['Graphics', info.graphics],
    ['License', info.license],
  ];
  return (
    <dl>
      {rows.map(([term, value]) => [
        <dt key={`${term}-term`}>{term}</dt>,
        <dd key={term}>{value}</dd>,
      ])}
    </dl>
  );
}

function Links(): JSX.Element {
  return (
    <nav aria-label="Links">
      <ul>
        {LINKS.map(({ label, href }) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function useAboutInfo(api: ChromeApi): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  useEffect(() => {
    api.about.info().then(
      (info) => {
        setLoad({ state: 'ready', info });
      },
      () => {
        setLoad({ state: 'failed' });
      },
    );
  }, [api]);
  return load;
}

function useCopy(api: ChromeApi): readonly [string, () => void] {
  const [status, setStatus] = useState('');
  const copy = (): void => {
    api.about.copyTechnicalDetails().then(
      () => {
        setStatus('Copied to the clipboard.');
      },
      () => {
        setStatus('Could not copy the details.');
      },
    );
  };
  return [status, copy];
}

export function About({ api }: { readonly api: ChromeApi }): JSX.Element {
  const load = useAboutInfo(api);
  const [copyStatus, copy] = useCopy(api);
  return (
    <main>
      <img src="./icon.svg" alt="" width={96} height={96} />
      <h1>YapYap</h1>
      {load.state === 'ready' ? (
        <Details info={load.info} />
      ) : (
        <p>{load.state === 'loading' ? 'Loading…' : 'Details are unavailable.'}</p>
      )}
      <button type="button" onClick={copy}>
        Copy technical details
      </button>
      <output>{copyStatus}</output>
      <Links />
      <p class="supporter">
        Development supported by{' '}
        <a href={SUPPORTER.href} target="_blank" rel="noreferrer">
          {SUPPORTER.name}
        </a>
        {'.'}
      </p>
      <p class="disclaimer">
        YapYap is unofficial and is not affiliated with, endorsed by, or sponsored by WhatsApp or
        Meta.
      </p>
    </main>
  );
}
