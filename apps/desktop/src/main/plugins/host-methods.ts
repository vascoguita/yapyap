import type { SettingValue } from '@yapyap/plugin-sdk';
import { Type } from 'typebox';
import { en } from '../../shared/messages/en.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import type { RpcMethod } from './rpc.ts';

export interface HostServices {
  /** Shows a native notification. */
  readonly notify: (title: string, body: string) => void;
  /** Do not disturb is on, so nothing may show. */
  readonly quiet: () => boolean;
  /** Plugins' secrets, kept apart from YapYap's own. */
  readonly secrets: Pick<SecretStore, 'get' | 'set'>;
  /** Puts a draft in the active account's open chat; false when none is open. */
  readonly insertDraft: (text: string) => Promise<boolean>;
}

/** The plugin whose calls these are. */
export interface CallingPlugin {
  readonly id: string;
  readonly name: string;
  /** The values the user saved in the plugin's settings form, as they stand now (#98). */
  readonly settings: () => Readonly<Record<string, SettingValue>>;
}

const Notification = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 120 }),
    body: Type.String({ maxLength: 1000 }),
  },
  { additionalProperties: false },
);

const OWN_SECRETS = 'secrets:own';

/** A secret's name: plain, so it cannot reach outside the plugin's own namespace. */
const SecretName = Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._-]+$' });

/** Long enough for any API key or token. */
const SecretValue = Type.String({ minLength: 1, maxLength: 8192 });

function notifications(plugin: CallingPlugin, services: HostServices): Record<string, RpcMethod> {
  return {
    'notifications.show': {
      capability: 'notifications:show',
      params: Type.Tuple([Notification]),
      run: ([notification]) => {
        const { title, body } = notification as { readonly title: string; readonly body: string };
        if (!services.quiet()) {
          services.notify(en.plugins.notificationTitle(plugin.name, title), body);
        }
        return Promise.resolve();
      },
    },
  };
}

/**
 * A plugin's secrets (#96), stored under its own ID: the ID comes from
 * YapYap, never from the call, so one plugin can never name another's.
 */
function secrets(plugin: CallingPlugin, services: HostServices): Record<string, RpcMethod> {
  const key = (name: unknown): string => `${plugin.id}/${String(name)}`;
  const keep = async (name: unknown, value: string | undefined): Promise<void> => {
    if (!(await services.secrets.set(key(name), value))) {
      throw new Error('This system cannot keep secrets safely.');
    }
  };
  return {
    'secrets.get': {
      capability: OWN_SECRETS,
      params: Type.Tuple([SecretName]),
      run: ([name]) => services.secrets.get(key(name)),
    },
    'secrets.set': {
      capability: OWN_SECRETS,
      params: Type.Tuple([SecretName, SecretValue]),
      run: ([name, value]) => keep(name, value as string),
    },
    'secrets.delete': {
      capability: OWN_SECRETS,
      params: Type.Tuple([SecretName]),
      run: ([name]) => keep(name, undefined),
    },
  };
}

/** Long enough for any reply a plugin drafts, short of what WhatsApp itself allows. */
const Draft = Type.String({ minLength: 1, maxLength: 4096 });

/** Drafts only: the user reads, edits and sends them; nothing here sends (ADR 0004). */
function composer(services: HostServices): Record<string, RpcMethod> {
  return {
    'composer.insertDraft': {
      capability: 'composer:insert-draft',
      params: Type.Tuple([Draft]),
      run: async ([text]) => {
        if (!(await services.insertDraft(text as string))) {
          throw new Error('No chat is open.');
        }
      },
    },
  };
}

/**
 * The host operations a plugin can call, each behind the capability its
 * SDK documentation names. Operations not listed here are not offered yet.
 */
export function hostMethods(
  plugin: CallingPlugin,
  services: HostServices,
): Readonly<Record<string, RpcMethod>> {
  return {
    // A plugin's own settings need no grant: the user filled them in for it.
    'settings.get': { params: Type.Tuple([]), run: () => Promise.resolve(plugin.settings()) },
    ...notifications(plugin, services),
    ...secrets(plugin, services),
    ...composer(services),
  };
}
