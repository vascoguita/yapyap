import { en } from '../../shared/messages/en.ts';

/** The ways the message box's rewrite button offers, Polish first (#609). */
export const POLISH_STYLES = ['polish', 'shorten', 'elaborate', 'formalize'] as const;

type PolishStyle = (typeof POLISH_STYLES)[number];

/** How the user wants their draft rewritten (#105): the button's ways, and more in the bar. */
type RewriteStyle = PolishStyle | 'friendlier' | 'translate';

/** Every way to rewrite but translating, in the order the bar lists them. */
const STYLES = [...POLISH_STYLES, 'friendlier'] as const;

const isStyle = (value: string): value is (typeof STYLES)[number] =>
  (STYLES as readonly string[]).includes(value);

/** Whether `value` is one of the message box button's ways. */
export const isPolishStyle = (value: string): value is PolishStyle =>
  (POLISH_STYLES as readonly string[]).includes(value);

/** A rewrite the bar offers: a style, and for a translation, the language's English name. */
export interface Rewrite {
  readonly style: RewriteStyle;
  readonly language: string;
}

const ASKS: Readonly<Record<RewriteStyle, (language: string) => string>> = {
  polish: () =>
    'so its spelling, grammar and flow are right and it reads clearly, keeping its voice and core message',
  shorten: () => 'so it is more concise and to the point',
  elaborate: () =>
    'so it expands on its points with more detail, context or polite phrasing, adding no facts it does not give',
  formalize: () => 'so its tone is more professional and formal',
  friendlier: () => 'so it sounds warmer and friendlier',
  translate: (language) => `translated into ${language}`,
};

/** What the model is asked to do with the draft, shown with it when asked what is sent. */
export function rewriteInstructions({ style, language }: Rewrite): string {
  return [
    `Rewrite the WhatsApp message the user drafted ${ASKS[style](language)}.`,
    'Keep its meaning, and anything it names, such as times and places.',
    ...(style === 'translate' ? [] : ['Write it in the language the draft is in.']),
    'Answer with the rewritten message only, with no quotes or other text.',
  ].join(' ');
}

/** A model's text without the quotes it may put around it, as around a rewritten draft. */
export function cleanRewrite(answer: string): string {
  return answer
    .trim()
    .replaceAll(/^["“”']|["“”']$/g, '')
    .trim();
}

/** As many languages as the bar offers to translate to. */
const MAX_LANGUAGES = 4;

const TRANSLATE = 'translate:';

/**
 * The languages to offer translating to: the system's, then English, by
 * their base language and without repeats, as `pt` for `pt-BR`.
 */
export function translationLanguages(system: readonly string[]): readonly string[] {
  const codes = [...system, 'en']
    .map((tag) => tag.split('-', 1).join('').toLowerCase())
    .filter((code) => /^[a-z]{2,3}$/.test(code));
  return [...new Set(codes)].slice(0, MAX_LANGUAGES);
}

const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

/** A language's name in English, which the model reads, or undefined for a code without one. */
const languageName = (code: string): string | undefined => names.of(code);

/** The rewrites the bar offers: the styles, then translating to each of `languages`. */
export function rewriteOptions(
  languages: readonly string[],
): readonly { readonly value: string; readonly label: string }[] {
  const styles = en.assistant.bar.styles;
  const translations = languages.flatMap((code) => {
    const language = languageName(code);
    return language === undefined
      ? []
      : [{ value: `${TRANSLATE}${code}`, label: en.assistant.bar.translate({ language }) }];
  });
  return [...STYLES.map((value) => ({ value, label: styles[value] })), ...translations];
}

/** The rewrite an offered value names, or undefined for anything the bar did not offer. */
export function rewriteOf(value: string, languages: readonly string[]): Rewrite | undefined {
  if (isStyle(value)) {
    return { style: value, language: '' };
  }
  const code = value.startsWith(TRANSLATE) ? value.slice(TRANSLATE.length) : '';
  const language = languages.includes(code) ? languageName(code) : undefined;
  return language === undefined ? undefined : { style: 'translate', language };
}
