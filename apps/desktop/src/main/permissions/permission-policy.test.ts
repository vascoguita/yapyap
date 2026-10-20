import { describe, expect, it } from 'vitest';
import { decidePermission } from './permission-policy.ts';

describe('decidePermission', () => {
  it.each([
    ['notifications', 'allow'],
    ['clipboard-sanitized-write', 'allow'],
    ['fullscreen', 'allow'],
    ['speaker-selection', 'allow'],
    ['media', 'ask'],
    ['geolocation', 'deny'],
    ['clipboard-read', 'deny'],
    ['pointerLock', 'deny'],
    ['hid', 'deny'],
    ['serial', 'deny'],
    ['usb', 'deny'],
    ['display-capture', 'deny'],
    ['openExternal', 'deny'],
    ['toString', 'deny'],
    ['unknown', 'deny'],
  ])('gives WhatsApp on its own origin %s: %s', (permission, decision) => {
    expect(decidePermission('whatsapp', permission, true)).toBe(decision);
  });

  it('denies everything to WhatsApp frames from other origins', () => {
    expect(decidePermission('whatsapp', 'notifications', false)).toBe('deny');
    expect(decidePermission('whatsapp', 'media', false)).toBe('deny');
  });

  it('denies everything to app chrome and to unknown web contents', () => {
    expect(decidePermission('chrome', 'notifications', true)).toBe('deny');
    expect(decidePermission(undefined, 'notifications', true)).toBe('deny');
  });
});
