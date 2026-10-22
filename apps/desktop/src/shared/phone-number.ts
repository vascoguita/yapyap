/** E.164 allows at most 15 digits; no country's full numbers are shorter than 7. */
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;
/** Separators people type or paste between groups of digits. */
const SEPARATORS = /[\s().-]/g;

/**
 * Reads an international phone number as people write it, such as
 * `+44 7700 900123` or `0044 (7700) 900-123`, and returns its digits, or
 * undefined when it is not one. The country code is required, because
 * WhatsApp cannot tell which country a local number belongs to.
 */
export function parseInternationalNumber(input: string): string | undefined {
  const compact = input.trim().replaceAll(SEPARATORS, '');
  const digits = /^(?:\+|00)([1-9]\d*)$/.exec(compact)?.[1];
  return digits !== undefined && digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS
    ? digits
    : undefined;
}
