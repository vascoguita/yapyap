/**
 * Declarations that fix a side to left or right, which a right-to-left
 * language would need mirrored (ADR 0012): `margin-left`, `left: 0`,
 * `text-align: right`, `border-top-left-radius` and the like. Their logical
 * forms, such as `margin-inline-start` or `text-align: start`, follow the
 * text's direction.
 */
const PHYSICAL = [
  /(?:^|[\s;{])(?:margin|padding|border|inset)-(?:left|right)\b/,
  /(?:^|[\s;{])(?:left|right)\s*:/,
  /(?:^|[\s;{])border-(?:top|bottom)-(?:left|right)-radius\b/,
  /(?:^|[\s;{])(?:text-align|float|clear)\s*:\s*(?:left|right)\b/,
];

/** Drops comments, keeping line breaks so line numbers stay right. */
const withoutComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));

/** Every line of a stylesheet that uses a physical left or right, as `line N: text`. */
export function physicalDeclarations(css: string): string[] {
  return withoutComments(css)
    .split('\n')
    .flatMap((line, index) =>
      PHYSICAL.some((pattern) => pattern.test(line))
        ? [`line ${String(index + 1)}: ${line.trim()}`]
        : [],
    );
}
