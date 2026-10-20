import type { Zone } from '../views.ts';

export type Decision = 'allow' | 'ask' | 'deny';

/**
 * The WhatsApp zone's allowlist (ADR 0001). Speaker selection lets calls use
 * the output device the user picks. Every other permission, and every zone
 * other than WhatsApp, is denied.
 */
const WHATSAPP: ReadonlyMap<string, Decision> = new Map<string, Decision>([
  ['notifications', 'allow'],
  ['clipboard-sanitized-write', 'allow'],
  ['fullscreen', 'allow'],
  ['speaker-selection', 'allow'],
  ['media', 'ask'],
]);

export function decidePermission(
  zone: Zone | undefined,
  permission: string,
  fromHome: boolean,
): Decision {
  if (zone !== 'whatsapp' || !fromHome) return 'deny';
  return WHATSAPP.get(permission) ?? 'deny';
}
