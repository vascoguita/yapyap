/** Orders strings by UTF-16 code unit, the same everywhere, unlike locale-aware comparison. */
export function compareCodeUnits(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    // Code units, not code points: signatures depend on this order, and code
    // points would order astral characters differently.
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }
  return a.length - b.length;
}

function isJsonPrimitive(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return typeof value === 'string' || typeof value === 'boolean' || value === null;
}

function serialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const members = Object.entries(value)
      .sort(([a], [b]) => compareCodeUnits(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${serialize(item)}`);
    return `{${members.join(',')}}`;
  }
  if (isJsonPrimitive(value)) {
    return JSON.stringify(value);
  }
  throw new TypeError('Only JSON values can be signed.');
}

/**
 * JSON with object keys sorted at every level and no whitespace, so equal
 * values always produce the same bytes to sign (ADR 0004).
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}
