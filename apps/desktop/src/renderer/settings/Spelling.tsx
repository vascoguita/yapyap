import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  MAX_SPELLING_LANGUAGES,
  type ChromeApi,
  type SettingsSnapshot,
  type SpellingLanguages,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { fieldsOf, Group, type Change } from './Field.tsx';

const text = en.spellingLanguages;
const groups = en.settings.groups;

/** A language's name in a locale; the code itself where the locale has none. */
function nameIn(locale: string, code: string): string {
  const names = new Intl.DisplayNames([locale], {
    type: 'language',
    languageDisplay: 'standard',
    fallback: 'none',
  });
  return names.of(code) ?? code;
}

/** Each language in itself, so people find their own, and in English. */
export function languageNames(code: string): { readonly own: string; readonly english: string } {
  return { own: nameIn(code, code), english: nameIn('en', code) };
}

/** Lowercase without accents, so “portugues” finds “Português”. */
const folded = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface Language {
  readonly code: string;
  readonly own: string;
  readonly english: string;
}

/** The chosen languages first, then the rest by English name, keeping those the search matches. */
function listed(state: SpellingLanguages, query: string): Language[] {
  const wanted = folded(query.trim());
  return state.available
    .map((code) => ({ code, ...languageNames(code) }))
    .filter((language) =>
      [language.code, language.own, language.english].some((name) => folded(name).includes(wanted)),
    )
    .sort(
      (a, b) =>
        Number(state.chosen.includes(b.code)) - Number(state.chosen.includes(a.code)) ||
        a.english.localeCompare(b.english, 'en'),
    );
}

interface PickerProps {
  readonly state: SpellingLanguages;
  /** Faded while spell checking is off; the choice still applies once it is on. */
  readonly dimmed: boolean;
  readonly onChoose: (languages: readonly string[]) => void;
}

const rowClass = (dimmed: boolean): string => (dimmed ? 'row dimmed' : 'row');

/** What is checked now, in words, as the row's name and its hint. */
function summaryOf({ chosen, inUse }: SpellingLanguages): { label: string; hint?: string } {
  const max = MAX_SPELLING_LANGUAGES;
  if (chosen.length > 0) {
    return { label: text.chosen({ count: chosen.length, max }) };
  }
  if (inUse.length === 0) {
    return { label: text.noSystem, hint: text.noSystemHint({ max }) };
  }
  const names = inUse.map((code) => languageNames(code).own).join(', ');
  return { label: text.system({ names }), hint: text.systemHint({ max }) };
}

function Summary(props: PickerProps): JSX.Element {
  const { label, hint } = summaryOf(props.state);
  return (
    <div class={rowClass(props.dimmed)}>
      <div class="row-text">
        <span class="row-label">{label}</span>
        {hint === undefined ? null : <p class="hint">{hint}</p>}
      </div>
      {props.state.chosen.length === 0 ? null : (
        <div class="row-control">
          <button
            type="button"
            onClick={() => {
              props.onChoose([]);
            }}
          >
            {text.useSystem}
          </button>
        </div>
      )}
    </div>
  );
}

function LanguageList(props: PickerProps & { readonly query: string }): JSX.Element {
  const { chosen } = props.state;
  const languages = listed(props.state, props.query);
  if (languages.length === 0) {
    return (
      <div class="row">
        <p class="hint">{text.noMatch}</p>
      </div>
    );
  }
  const full = chosen.length >= MAX_SPELLING_LANGUAGES;
  return (
    <ul class={props.dimmed ? 'languages dimmed' : 'languages'}>
      {languages.map(({ code, own, english }) => {
        const checked = chosen.includes(code);
        return (
          <li key={code}>
            <label>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && full}
                onChange={() => {
                  props.onChoose(
                    checked ? chosen.filter((other) => other !== code) : [...chosen, code],
                  );
                }}
              />
              <span lang={code}>{own}</span>
              {own === english ? null : <span class="hint">{english}</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Picker(props: PickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  return (
    <>
      <Summary {...props} />
      <div class="row spelling-search">
        <input
          type="search"
          aria-label={text.search}
          placeholder={text.search}
          value={query}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </div>
      <LanguageList {...props} query={query} />
    </>
  );
}

/** macOS lists no dictionaries: its own spell checker follows the system's languages. */
function ChosenByMacos({ dimmed }: { readonly dimmed: boolean }): JSX.Element {
  return (
    <div class={rowClass(dimmed)}>
      <div class="row-text">
        <span class="row-label">{text.macosLabel}</span>
        <p class="hint">{text.macos}</p>
      </div>
    </div>
  );
}

/**
 * Settings › Spelling: the switch, then the languages it checks; none
 * chosen means the system's (#73).
 */
export function SpellingSection(props: {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element {
  const { api, snapshot, onChange } = props;
  const [state, setState] = useState<SpellingLanguages>();
  useEffect(() => {
    void api.spelling.languages().then(setState);
  }, [api]);
  const choose = useCallback(
    (languages: readonly string[]): void => {
      void api.spelling.choose(languages).then(setState);
    },
    [api],
  );
  const dimmed = snapshot.values['spelling.enabled'] !== true;
  return (
    <>
      <Group id="spell-checking" title={groups.spellChecking}>
        {fieldsOf(['spelling.enabled'], snapshot, onChange)}
      </Group>
      {state === undefined ? null : (
        <Group id="spelling-languages" title={groups.spellingLanguages}>
          {state.available.length === 0 ? (
            <ChosenByMacos dimmed={dimmed} />
          ) : (
            <Picker state={state} dimmed={dimmed} onChoose={choose} />
          )}
        </Group>
      )}
    </>
  );
}
