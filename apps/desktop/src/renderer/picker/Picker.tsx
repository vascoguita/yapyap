import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi, PickerOffer, PickerSource } from '../../shared/chrome-api.ts';

const GROUPS = [
  { kind: 'screen', title: 'Screens' },
  { kind: 'window', title: 'Windows' },
] as const;

/** Escape cancels, like closing the window. */
export function cancelOnEscape(api: ChromeApi): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === 'Escape') void api.picker.cancel();
  };
}

function Source(props: {
  readonly source: PickerSource;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  const { source, selected, onSelect } = props;
  return (
    <label class="source">
      <input
        type="radio"
        name="source"
        value={source.id}
        checked={selected}
        onChange={() => {
          onSelect(source.id);
        }}
      />
      <img src={source.thumbnail} alt="" width={160} height={90} />
      <span>{source.name}</span>
    </label>
  );
}

function Sources(props: {
  readonly offer: PickerOffer;
  readonly selected: string | undefined;
  readonly onSelect: (id: string) => void;
}): JSX.Element[] {
  return GROUPS.flatMap(({ kind, title }) => {
    const sources = props.offer.sources.filter((source) => source.kind === kind);
    if (sources.length === 0) return [];
    return [
      <fieldset key={kind} class="sources">
        <legend>{title}</legend>
        {sources.map((source) => (
          <Source
            key={source.id}
            source={source}
            selected={source.id === props.selected}
            onSelect={props.onSelect}
          />
        ))}
      </fieldset>,
    ];
  });
}

function useOffer(api: ChromeApi): PickerOffer | null | undefined {
  const [offer, setOffer] = useState<PickerOffer | null | undefined>(undefined);
  useEffect(() => {
    api.picker.offer().then(setOffer, () => {
      setOffer(null);
    });
  }, [api]);
  return offer;
}

function Choices(props: { readonly api: ChromeApi; readonly offer: PickerOffer }): JSX.Element {
  const { api, offer } = props;
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [audio, setAudio] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (selected !== undefined) void api.picker.choose(selected, audio);
      }}
    >
      <Sources offer={offer} selected={selected} onSelect={setSelected} />
      {offer.offerAudio ? (
        <label class="audio">
          <input
            type="checkbox"
            checked={audio}
            onChange={(event) => {
              setAudio(event.currentTarget.checked);
            }}
          />
          Also share system audio
        </label>
      ) : null}
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            void api.picker.cancel();
          }}
        >
          Cancel
        </button>
        <button type="submit" disabled={selected === undefined}>
          Share
        </button>
      </div>
    </form>
  );
}

export function Picker({ api }: { readonly api: ChromeApi }): JSX.Element {
  const offer = useOffer(api);
  return (
    <main class="picker">
      <h1>Choose what to share</h1>
      {offer == null ? (
        <p>{offer === undefined ? 'Loading…' : 'Nothing can be shared right now.'}</p>
      ) : (
        <Choices api={api} offer={offer} />
      )}
    </main>
  );
}
