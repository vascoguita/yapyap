import { compareCodeUnits } from './canonical.ts';

const FINGERPRINT = /^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$/;
const PLUGIN_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/;

/** Plugin ID to the fingerprint of the key the user accepted at install. */
export type Pins = ReadonlyMap<string, string>;

/** Reads the pin file; unreadable or malformed entries pin nothing. */
export function readPins(text: string): Pins {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Map();
  }
  const { pins } = Object(value) as { pins?: unknown };
  const entries = Object.entries(Object(pins) as Record<string, unknown>);
  return new Map(
    entries.filter(
      (entry): entry is [string, string] =>
        PLUGIN_ID.test(entry[0]) && typeof entry[1] === 'string' && FINGERPRINT.test(entry[1]),
    ),
  );
}

/** The pin file's text, sorted so it changes only when a pin does. */
export function writePins(pins: Pins): string {
  const sorted = Object.fromEntries([...pins].sort(([a], [b]) => compareCodeUnits(a, b)));
  return `${JSON.stringify({ version: 1, pins: sorted }, null, 2)}\n`;
}
