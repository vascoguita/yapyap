import { Type, type Static } from 'typebox';
import { MAX_SPELLING_LANGUAGES } from '../../shared/chrome-api.ts';

/**
 * The settings file's shape (ADR 0006). The TypeScript type is derived from
 * it, so the schema is the only source of truth. Every value has a default,
 * which is what an invalid or missing value falls back to.
 */
export const SETTINGS_VERSION = 13;

export const SettingsSchema = Type.Object(
  {
    schemaVersion: Type.Literal(SETTINGS_VERSION),
    general: Type.Object(
      {
        language: Type.String({ default: 'system', maxLength: 35 }),
        startMinimized: Type.Boolean({ default: false }),
        autostart: Type.Boolean({ default: false }),
        closeToTray: Type.Boolean({ default: false }),
        betaUpdates: Type.Boolean({ default: false }),
        doNotDisturb: Type.Boolean({ default: false }),
      },
      { default: {}, additionalProperties: false },
    ),
    spelling: Type.Object(
      {
        enabled: Type.Boolean({ default: false }),
        // Empty means the system language. Codes such as en-GB are only ever
        // used when Chromium has a dictionary of that name, so the schema
        // checks no pattern: a pattern would leave a bad code unrepairable.
        languages: Type.Array(Type.String({ maxLength: 35 }), {
          maxItems: MAX_SPELLING_LANGUAGES,
          uniqueItems: true,
          default: [],
        }),
      },
      { default: {}, additionalProperties: false },
    ),
    appearance: Type.Object(
      {
        theme: Type.Union([Type.Literal('system'), Type.Literal('light'), Type.Literal('dark')], {
          default: 'system',
        }),
        zoom: Type.Number({ minimum: 0.5, maximum: 3, default: 1 }),
        pinchZoom: Type.Boolean({ default: true }),
        autoHideMenuBar: Type.Boolean({ default: false }),
        compactSidebar: Type.Boolean({ default: false }),
        trayIcon: Type.Union(
          [
            Type.Literal('color'),
            Type.Literal('auto'),
            Type.Literal('light'),
            Type.Literal('dark'),
          ],
          { default: 'color' },
        ),
      },
      { default: {}, additionalProperties: false },
    ),
    reliability: Type.Object(
      {
        hardwareAcceleration: Type.Boolean({ default: true }),
        hardwareVideoDecoding: Type.Boolean({ default: true }),
        memoryWatchdogMb: Type.Integer({ minimum: 512, maximum: 16_384, default: 2048 }),
        diskCacheMb: Type.Union(
          [
            Type.Literal('auto'),
            Type.Literal('128'),
            Type.Literal('256'),
            Type.Literal('512'),
            Type.Literal('1024'),
          ],
          { default: 'auto' },
        ),
        jsHeapMb: Type.Union(
          [Type.Literal('auto'), Type.Literal('2048'), Type.Literal('4096'), Type.Literal('8192')],
          { default: 'auto' },
        ),
        displayBackend: Type.Union(
          [Type.Literal('auto'), Type.Literal('wayland'), Type.Literal('x11')],
          { default: 'auto' },
        ),
      },
      { default: {}, additionalProperties: false },
    ),
    downloads: Type.Object(
      {
        askWhere: Type.Boolean({ default: false }),
        openWhenDone: Type.Boolean({ default: false }),
        // Empty means the system's Downloads folder; set only through the folder picker.
        folder: Type.String({ maxLength: 4096, default: '' }),
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
        unreadWhileHidden: Type.Boolean({ default: true }),
        notificationSender: Type.Boolean({ default: true }),
        notificationText: Type.Boolean({ default: true }),
        blurWhenUnfocused: Type.Boolean({ default: false }),
        blurWhenIdle: Type.Boolean({ default: false }),
      },
      { default: {}, additionalProperties: false },
    ),
    network: Type.Object(
      {
        proxyMode: Type.Union(
          [Type.Literal('system'), Type.Literal('direct'), Type.Literal('manual')],
          { default: 'system' },
        ),
        // A scheme, a host and an optional port; credentials never go here (#76).
        proxyServer: Type.String({
          default: '',
          maxLength: 255,
          pattern: '^$|^(https?|socks5)://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$',
        }),
      },
      { default: {}, additionalProperties: false },
    ),
    plugins: Type.Object(
      {
        developerMode: Type.Boolean({ default: false }),
      },
      { default: {}, additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type Settings = Static<typeof SettingsSchema>;
