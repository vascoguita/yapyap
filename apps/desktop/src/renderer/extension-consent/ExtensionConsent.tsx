import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, ExtensionConsent as Consent } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.extensions.consent;

/** Extensions YapYap vouches for: its own, and the marketplace's reviewed ones (ADR 0014). */
const vouched = (consent: Consent): boolean =>
  consent.trust === 'first-party' || consent.trust === 'reviewed';

const asIs = (item: string): string => item;

function describe(capability: string): string {
  return (en.extensions.capabilities as Readonly<Record<string, string>>)[capability] ?? capability;
}

/** Who signed the extension: YapYap, a key the user is about to trust, or nobody. */
function Signer({ consent }: { readonly consent: Consent }): JSX.Element {
  if (consent.trust === 'first-party') {
    return <p class="signer">{text.firstParty}</p>;
  }
  return (
    <>
      <p class="signer">
        <span>{text.key}</span>
        <code>{consent.fingerprint ?? text.unsigned}</code>
      </p>
      {consent.trust === 'reviewed' ? <p class="reviewed">{text.reviewed}</p> : null}
    </>
  );
}

function GrantList(props: {
  readonly items: readonly string[];
  readonly added: readonly string[];
  readonly label: (item: string) => string;
}): JSX.Element {
  return (
    <ul class="grants">
      {props.items.map((item) => (
        <li key={item} class={props.added.includes(item) ? 'added' : undefined}>
          {props.label(item)}
          {/* Said in words too, not by color and weight alone. */}
          {props.added.includes(item) ? <span class="new">{text.added}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Everything the extension asks for; on an update, what is new comes first, and stands out. */
function Grants({ consent }: { readonly consent: Consent }): JSX.Element {
  const { capabilities, hosts, added } = consent;
  if (capabilities.length === 0 && hosts.length === 0) {
    return <p>{text.nothing}</p>;
  }
  return (
    <section>
      <h2>{consent.update ? text.updateAsks : text.asks}</h2>
      <GrantList items={capabilities} added={added.capabilities} label={describe} />
      {hosts.length > 0 ? (
        <>
          <h2>{text.hosts}</h2>
          <GrantList items={hosts} added={added.hosts} label={asIs} />
        </>
      ) : null}
    </section>
  );
}

/** The extension YapYap has not reviewed: the user must say they take the risk. */
function Risk(props: {
  readonly consent: Consent;
  readonly acknowledged: boolean;
  readonly onChange: (acknowledged: boolean) => void;
}): JSX.Element {
  return (
    <section class="risk" role="note">
      <p>{props.consent.trust === 'developer' ? text.unsignedRisk : text.risk}</p>
      <label>
        <input
          type="checkbox"
          checked={props.acknowledged}
          onChange={(event) => {
            props.onChange(event.currentTarget.checked);
          }}
        />
        {text.acknowledge}
      </label>
    </section>
  );
}

function Actions(props: {
  readonly api: ChromeApi;
  readonly consent: Consent;
  readonly acknowledged: boolean;
}): JSX.Element {
  const { api, consent, acknowledged } = props;
  const reviewed = vouched(consent);
  return (
    <div class="actions">
      <button
        type="button"
        onClick={() => {
          void api.extensions.answer(false, false);
        }}
      >
        {en.common.cancel}
      </button>
      <button
        type="button"
        disabled={!reviewed && !acknowledged}
        onClick={() => {
          void api.extensions.answer(true, acknowledged);
        }}
      >
        {consent.update ? text.confirmUpdate : text.confirmInstall}
      </button>
    </div>
  );
}

/**
 * Asks before an extension is installed or updated (ADR 0004): who made it, who
 * signed it, and everything it may do. Install stays off for an extension YapYap
 * has not reviewed until the user accepts the risk.
 */
export function ExtensionConsent({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    api.extensions.consent().then(setConsent, () => undefined);
  }, [api]);
  if (consent === null) {
    return null;
  }
  return (
    <main class="consent">
      <h1>
        {consent.update
          ? text.update({ name: consent.name, version: consent.version })
          : text.install({ name: consent.name })}
      </h1>
      <p class="hint">{text.author({ name: consent.author.name })}</p>
      {consent.author.url === null ? null : <p class="hint url">{consent.author.url}</p>}
      <Signer consent={consent} />
      <Grants consent={consent} />
      {vouched(consent) ? null : (
        <Risk consent={consent} acknowledged={acknowledged} onChange={setAcknowledged} />
      )}
      <Actions api={api} consent={consent} acknowledged={acknowledged} />
    </main>
  );
}
