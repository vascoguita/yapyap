import { Type, type Static } from 'typebox';

/**
 * The settings file's shape (ADR 0006). The TypeScript type is derived from
 * it, so the schema is the only source of truth. Every value has a default,
 * which is what an invalid or missing value falls back to.
 */
export const SETTINGS_VERSION = 1;

export const SettingsSchema = Type.Object(
  {
    schemaVersion: Type.Literal(SETTINGS_VERSION),
    general: Type.Object(
      {
        language: Type.String({ default: 'system', maxLength: 35 }),
        startMinimized: Type.Boolean({ default: false }),
        autostart: Type.Boolean({ default: false }),
      },
      { default: {}, additionalProperties: false },
    ),
    appearance: Type.Object(
      {
        theme: Type.Union([Type.Literal('system'), Type.Literal('light'), Type.Literal('dark')], {
          default: 'system',
        }),
        zoom: Type.Number({ minimum: 0.5, maximum: 3, default: 1 }),
      },
      { default: {}, additionalProperties: false },
    ),
    reliability: Type.Object(
      {
        hardwareAcceleration: Type.Boolean({ default: true }),
        hardwareVideoDecoding: Type.Boolean({ default: true }),
        memoryWatchdogMb: Type.Integer({ minimum: 512, maximum: 16_384, default: 2048 }),
      },
      { default: {}, additionalProperties: false },
    ),
    privacy: Type.Object(
      {
        crashReports: Type.Union(
          [Type.Literal('off'), Type.Literal('local'), Type.Literal('ask')],
          {
            default: 'off',
          },
        ),
      },
      { default: {}, additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type Settings = Static<typeof SettingsSchema>;
