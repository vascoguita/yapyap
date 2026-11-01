import { describe, expect, it } from 'vitest';
import { argumentsOf, noArguments } from './arguments.ts';

const isText = (value: unknown): boolean => typeof value === 'string';
const isFlag = (value: unknown): boolean => typeof value === 'boolean';
const isOptional = (value: unknown): boolean => value === undefined || isFlag(value);

describe('noArguments', () => {
  it('accepts only an empty argument list', () => {
    expect(noArguments([])).toBe(true);
    expect(noArguments([undefined])).toBe(false);
  });
});

describe('argumentsOf', () => {
  it('accepts arguments that pass their own checks, in order', () => {
    expect(argumentsOf(isText, isFlag)(['a', true])).toBe(true);
    expect(argumentsOf(isText, isFlag)([true, 'a'])).toBe(false);
    expect(argumentsOf(isText, isFlag)(['a', 'b'])).toBe(false);
  });

  it('rejects any argument past the last check', () => {
    expect(argumentsOf(isText)(['a', undefined])).toBe(false);
    expect(argumentsOf()([])).toBe(true);
    expect(argumentsOf()([1])).toBe(false);
  });

  it('checks a missing trailing argument as undefined', () => {
    expect(argumentsOf(isText, isOptional)(['a'])).toBe(true);
    expect(argumentsOf(isText, isFlag)(['a'])).toBe(false);
  });
});
