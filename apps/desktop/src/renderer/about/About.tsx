import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AboutInfo, ChromeApi } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.about;

export const LINKS = [
  { label: text.links.website, href: 'https://yapyap.guita.org/' },
  { label: text.links.source, href: 'https://github.com/vascoguita/yapyap' },
  { label: text.links.issues, href: 'https://github.com/vascoguita/yapyap/issues' },
  { label: text.links.privacy, href: 'https://yapyap.guita.org/privacy' },
  { label: text.links.sponsor, href: 'https://github.com/sponsors/vascoguita' },
] as const;

export const SUPPORTER = { name: 'Ensita', href: 'https://www.ensita.org/' } as const;

type Load =
  { readonly state: 'loading' | 'failed' } | { readonly state: 'ready'; readonly info: AboutInfo };

function Details({ info }: { readonly info: AboutInfo }): JSX.Element {
  const rows: readonly (readonly [string, string])[] = [
    [text.details.version, text.versionValue({ version: info.version, channel: info.channel })],
    ['Electron', info.electron],
    ['Chromium', info.chromium],
    ['Node.js', info.node],
    [text.details.operatingSystem, info.os],
    [text.details.graphics, info.graphics],
    [text.details.license, info.license],
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
    <nav aria-label={text.linksLabel}>
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
        setStatus(text.copied);
      },
      () => {
        setStatus(text.copyFailed);
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
      <h1>{text.title}</h1>
      {load.state === 'ready' ? (
        <Details info={load.info} />
      ) : (
        <p>{load.state === 'loading' ? en.common.loading : text.unavailable}</p>
      )}
      <button type="button" onClick={copy}>
        {text.copyDetails}
      </button>
      <output>{copyStatus}</output>
      <Links />
      <p class="supporter">
        {text.supportedBy}{' '}
        <a href={SUPPORTER.href} target="_blank" rel="noreferrer">
          {SUPPORTER.name}
        </a>
        {'.'}
      </p>
      <p class="disclaimer">{text.disclaimer}</p>
    </main>
  );
}
