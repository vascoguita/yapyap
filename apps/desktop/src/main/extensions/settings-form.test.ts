import { describe, expect, it } from 'vitest';
import { fits, formOf, valuesOf } from './settings-form.ts';

const SCHEMA = {
  type: 'object',
  properties: {
    model: { type: 'string', title: 'Model', enum: ['small', 'large'] },
    endpoint: { type: 'string', title: 'Endpoint', maxLength: 20 },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
    replies: { type: 'integer', minimum: 1, maximum: 5, description: 'How many to suggest.' },
    concise: { type: 'boolean' },
  },
};

const field = (key: string) => {
  const found = formOf(SCHEMA).find((entry) => entry.key === key);
  if (found === undefined) {
    throw new Error(`No ${key}.`);
  }
  return found;
};

describe('formOf', () => {
  it('renders a plain object of simple fields, in their order', () => {
    expect(formOf(SCHEMA).map(({ key, type }) => [key, type])).toEqual([
      ['model', 'string'],
      ['endpoint', 'string'],
      ['temperature', 'number'],
      ['replies', 'integer'],
      ['concise', 'boolean'],
    ]);
  });

  it('renders nothing it cannot draw safely', () => {
    for (const schema of [
      undefined,
      { type: 'array' },
      { type: 'object', properties: { nested: { type: 'object' } } },
      { type: 'object', properties: { html: { type: 'string', format: 'html' } } },
      { type: 'object', properties: { '1bad': { type: 'string' } } },
      { type: 'object', properties: { long: { type: 'string', title: 'x'.repeat(65) } } },
    ]) {
      expect(formOf(schema)).toEqual([]);
    }
  });
});

describe('fits', () => {
  it('takes only values of the field’s type, among its choices and within its bounds', () => {
    expect(fits(field('model'), 'small')).toBe(true);
    expect(fits(field('model'), 'medium')).toBe(false);
    expect(fits(field('endpoint'), 'https://x.example')).toBe(true);
    expect(fits(field('endpoint'), 'x'.repeat(21))).toBe(false);
    expect(fits(field('endpoint'), 7)).toBe(false);
    expect(fits(field('temperature'), 0.7)).toBe(true);
    expect(fits(field('temperature'), 2.5)).toBe(false);
    expect(fits(field('temperature'), -1)).toBe(false);
    expect(fits(field('temperature'), Number.NaN)).toBe(false);
    expect(fits(field('replies'), 3)).toBe(true);
    expect(fits(field('replies'), 2.5)).toBe(false);
    expect(fits(field('concise'), true)).toBe(true);
    expect(fits(field('concise'), 'true')).toBe(false);
  });

  it('caps text and leaves numbers unbounded when the schema says nothing', () => {
    const [text, number] = formOf({
      type: 'object',
      properties: { note: { type: 'string' }, any: { type: 'number' } },
    });
    expect(text && fits(text, 'x'.repeat(1000))).toBe(true);
    expect(text && fits(text, 'x'.repeat(1001))).toBe(false);
    expect(number && fits(number, -1e9)).toBe(true);
  });
});

describe('valuesOf', () => {
  it('gives the extension only saved values that still fit its form', () => {
    expect(
      valuesOf(formOf(SCHEMA), { model: 'large', replies: 9, gone: 'x', concise: false }),
    ).toEqual({ model: 'large', concise: false });
    expect(valuesOf(formOf(SCHEMA), undefined)).toEqual({});
  });
});
