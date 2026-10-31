/** Where the assistant keeps the private model the user chose, and whether it is all there. */
export const BUILT_IN_KEY = 'builtIn';

/** The user's choice of a private model (#457), as kept under {@link BUILT_IN_KEY}. */
export interface BuiltInRecord {
  readonly model: string;
  /** Its name, for the bar's model list. */
  readonly name: string;
  /** The whole file is saved and matched its SHA-256. */
  readonly ready: boolean;
}

/** The record kept under {@link BUILT_IN_KEY}, or undefined for anything else. */
export function builtInRecord(value: unknown): BuiltInRecord | undefined {
  const { model, name, ready } = Object(value) as Record<string, unknown>;
  const valid = typeof model === 'string' && typeof name === 'string' && typeof ready === 'boolean';
  return valid ? { model, name, ready } : undefined;
}

/** How the bar's model list names the private model. */
export const labelOf = (name: string): string => `Private model (${name})`;
