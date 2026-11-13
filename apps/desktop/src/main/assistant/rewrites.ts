/** The ways the message box's rewrite button offers, Polish first (#609). */
export const POLISH_STYLES = ['polish', 'shorten', 'elaborate', 'soften', 'formalize'] as const;

/** How the user wants their draft rewritten. */
export type PolishStyle = (typeof POLISH_STYLES)[number];

/** Whether `value` is one of the rewrite button's ways. */
export const isPolishStyle = (value: string): value is PolishStyle =>
  (POLISH_STYLES as readonly string[]).includes(value);

const ASKS: Readonly<Record<PolishStyle, string>> = {
  polish:
    'so its spelling, grammar and flow are right and it reads clearly, keeping its voice and core message',
  shorten: 'so it is more concise and to the point',
  elaborate:
    'so it expands on its points with more detail, context or polite phrasing, adding no facts it does not give',
  // The maintainer's brief: gentler, about as long, and no emoji the draft does not have.
  soften:
    'so it sounds gentler and friendlier, about as long as it is, with no emoji it does not already have',
  formalize: 'so its tone is more professional and formal',
};

/** What the model is asked to do with the draft. */
export function rewriteInstructions(style: PolishStyle): string {
  return [
    `Rewrite the WhatsApp message the user drafted ${ASKS[style]}.`,
    'Keep its meaning, and anything it names, such as times and places.',
    'Write it in the language the draft is in.',
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
