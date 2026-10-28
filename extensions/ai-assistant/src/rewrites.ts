/** How the user wants their draft rewritten (#105). */
export type RewriteStyle = 'friendlier' | 'formal' | 'shorter' | 'translate';

/** Longest language name the user may type for a translation. */
const MAX_LANGUAGE = 40;

const ASKS: Readonly<Record<RewriteStyle, (language: string) => string>> = {
  friendlier: () => 'so it sounds warmer and friendlier',
  formal: () => 'so it sounds more formal and polite',
  shorter: () => 'so it is shorter and to the point',
  translate: (language) => `translated into ${language}`,
};

/** A style the panel offers, or undefined for anything else. */
export function rewriteStyle(value: unknown): RewriteStyle | undefined {
  return typeof value === 'string' && Object.hasOwn(ASKS, value)
    ? (value as RewriteStyle)
    : undefined;
}

/** A language name the user typed, trimmed, or undefined when it is empty or too long. */
export function languageName(value: unknown): string | undefined {
  const name = typeof value === 'string' ? value.trim() : '';
  return name !== '' && name.length <= MAX_LANGUAGE ? name : undefined;
}

/** What the model is asked to do with the draft, shown with it before it is sent. */
export function rewriteInstructions(style: RewriteStyle, language: string): string {
  return [
    `Rewrite the WhatsApp message the user drafted ${ASKS[style](language)}.`,
    'Keep its meaning, and anything it names, such as times and places.',
    'Answer with the rewritten message only, with no quotes or other text.',
  ].join(' ');
}

/** The rewritten draft, without the quotes a model may put around it. */
export function cleanRewrite(answer: string): string {
  return answer
    .trim()
    .replaceAll(/^["“”']|["“”']$/g, '')
    .trim();
}
