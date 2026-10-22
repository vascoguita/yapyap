import { describe, expect, it } from 'vitest';
import { parseInternationalNumber } from './phone-number.ts';

describe('parseInternationalNumber', () => {
  it.each([
    ['+447700900123', '447700900123'],
    ['+44 7700 900123', '447700900123'],
    ['  0044 (7700) 900-123 ', '447700900123'],
    ['+1.555.010.0199', '15550100199'],
    ['+1234567', '1234567'],
    ['+123456789012345', '123456789012345'],
  ])('reads %j as %s', (input, digits) => {
    expect(parseInternationalNumber(input)).toBe(digits);
  });

  it.each([
    '',
    '447700900123',
    '07700 900123',
    '+0447700900123',
    '000447700900123',
    '+123456',
    '+1234567890123456',
    '+44 7700 900123 ext 4',
    '+44/7700/900123',
    '++447700900123',
    '+44 7700 9OO123',
  ])('rejects %j', (input) => {
    expect(parseInternationalNumber(input)).toBeUndefined();
  });
});
