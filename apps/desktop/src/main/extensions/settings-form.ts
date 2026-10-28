import type { SettingValue } from '@yapyap/extension-sdk';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/** Longest text a setting holds, such as a model name or an endpoint. */
const MAX_TEXT = 1000;

const Field = Type.Object(
  {
    type: Type.Union([
      Type.Literal('string'),
      Type.Literal('number'),
      Type.Literal('integer'),
      Type.Literal('boolean'),
    ]),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    description: Type.Optional(Type.String({ maxLength: 200 })),
    enum: Type.Optional(
      Type.Array(Type.Union([Type.String({ maxLength: 100 }), Type.Number()]), {
        minItems: 1,
        maxItems: 32,
        uniqueItems: true,
      }),
    ),
    minimum: Type.Optional(Type.Number()),
    maximum: Type.Optional(Type.Number()),
    maxLength: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TEXT })),
  },
  { additionalProperties: false },
);

/**
 * The part of JSON Schema YapYap renders as a form: an object of plain
 * fields. Anything richer is not shown, so an extension cannot shape YapYap's
 * window beyond labels and simple inputs.
 */
const Form = Type.Object(
  {
    type: Type.Literal('object'),
    properties: Type.Record(Type.String(), Field, {
      maxProperties: 32,
    }),
  },
  { additionalProperties: false },
);

/** A setting's name: plain, so it can be an element ID and a property alike. */
const KEY = /^[A-Za-z]\w{0,63}$/;

/** One field of an extension's settings form. */
export type SettingField = { readonly key: string } & Readonly<Static<typeof Field>>;

/** The fields of the form `schema` declares, or none when YapYap cannot render it. */
export function formOf(schema: unknown): SettingField[] {
  // Record keys are not checked against a pattern, so names are checked here.
  if (!Value.Check(Form, schema) || !Object.keys(schema.properties).every((key) => KEY.test(key))) {
    return [];
  }
  return Object.entries(schema.properties).map(([key, field]) => ({ key, ...field }));
}

function inRange(field: SettingField, value: number): boolean {
  const whole = field.type === 'number' || Number.isInteger(value);
  const minimum = field.minimum ?? -Infinity;
  const maximum = field.maximum ?? Infinity;
  return whole && value >= minimum && value <= maximum;
}

function typed(field: SettingField, value: unknown): boolean {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string' && value.length <= (field.maxLength ?? MAX_TEXT);
    default:
      return typeof value === 'number' && Number.isFinite(value) && inRange(field, value);
  }
}

/** Whether `value` fits `field`: its type, its choices, and its bounds. */
export function fits(field: SettingField, value: unknown): value is SettingValue {
  const listed = field.enum === undefined || field.enum.includes(value as string | number);
  return listed && typed(field, value);
}

/** The saved values that still fit the form, as the extension receives them. */
export function valuesOf(
  fields: readonly SettingField[],
  saved: Readonly<Record<string, unknown>> | undefined,
): Record<string, SettingValue> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = saved?.[field.key];
      return fits(field, value) ? [[field.key, value]] : [];
    }),
  );
}
