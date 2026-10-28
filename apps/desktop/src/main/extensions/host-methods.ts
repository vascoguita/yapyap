import type { ActiveChat, AssistantOffer, SettingValue } from '@yapyap/extension-sdk';
import { Type } from 'typebox';
import { en } from '../../shared/messages/en.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import type { KeyValueStore } from './key-value-store.ts';
import type { RpcMethod } from './rpc.ts';

export interface HostServices {
  /** Shows a native notification. */
  readonly notify: (title: string, body: string) => void;
  /** Do not disturb is on, so nothing may show. */
  readonly quiet: () => boolean;
  /** Extensions' secrets, kept apart from YapYap's own. */
  readonly secrets: Pick<SecretStore, 'get' | 'set'>;
  /** The calling extension's own key-value store. */
  readonly storage: KeyValueStore;
  /** Puts a draft in the active account's open chat; false when none is open. */
  readonly insertDraft: (text: string) => Promise<boolean>;
  /** The active account's open chat, as many messages as the user allows; null when none is open. */
  readonly readActiveChat: () => Promise<ActiveChat | null>;
  /** Replaces the draft in the active account's open chat; false when none is open. */
  readonly replaceDraft: (text: string) => Promise<boolean>;
  /** The draft in the active account's open chat; null when none is open. */
  readonly readDraft: () => Promise<string | null>;
  /** Shows the extension's offer in the assistant bar, if the bar serves this extension (ADR 0013). */
  readonly offerAssistant: (offer: AssistantOffer) => void;
}

/** The extension whose calls these are. */
export interface CallingExtension {
  readonly id: string;
  readonly name: string;
  /** The values the user saved in the extension's settings form, as they stand now (#98). */
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

/** A secret's name: plain, so it cannot reach outside the extension's own namespace. */
const SecretName = Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._-]+$' });

/** Long enough for any API key or token. */
const SecretValue = Type.String({ minLength: 1, maxLength: 8192 });

function notifications(
  extension: CallingExtension,
  services: HostServices,
): Record<string, RpcMethod> {
  return {
    'notifications.show': {
      capability: 'notifications:show',
      params: Type.Tuple([Notification]),
      run: ([notification]) => {
        const { title, body } = notification as { readonly title: string; readonly body: string };
        if (!services.quiet()) {
          services.notify(
            en.extensions.notificationTitle({ extension: extension.name, title }),
            body,
          );
        }
        return Promise.resolve();
      },
    },
  };
}

/**
 * An extension's secrets (#96), stored under its own ID: the ID comes from
 * YapYap, never from the call, so one extension can never name another's.
 */
function secrets(extension: CallingExtension, services: HostServices): Record<string, RpcMethod> {
  const key = (name: unknown): string => `${extension.id}/${String(name)}`;
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

/** A storage key: any short text, since keys never leave the extension's own store. */
const StorageKey = Type.String({ minLength: 1, maxLength: 256 });

const LOCAL_STORAGE = 'storage:local';

/** An extension's key-value store (#301); YapYap opens it for that extension alone. */
function storage(services: HostServices): Record<string, RpcMethod> {
  return {
    'storage.get': {
      capability: LOCAL_STORAGE,
      params: Type.Tuple([StorageKey]),
      run: ([key]) => Promise.resolve(services.storage.get(key as string)),
    },
    'storage.set': {
      capability: LOCAL_STORAGE,
      params: Type.Tuple([StorageKey, Type.Unknown()]),
      // A value JSON cannot hold throws inside the executor, so it rejects too.
      run: ([key, value]) =>
        new Promise<void>((resolve) => {
          if (!services.storage.set(key as string, value)) {
            throw new Error('The extension’s storage is full.');
          }
          resolve();
        }),
    },
    'storage.delete': {
      capability: LOCAL_STORAGE,
      params: Type.Tuple([StorageKey]),
      run: ([key]) => {
        services.storage.delete(key as string);
        return Promise.resolve();
      },
    },
  };
}

/**
 * Reading the open chat (#100): only through the adapter, as plain data,
 * for the account on screen, and as many messages as the user allows.
 */
function chat(services: HostServices): Record<string, RpcMethod> {
  return {
    'chat.readActive': {
      capability: 'chat:read-active',
      params: Type.Tuple([]),
      run: () => services.readActiveChat(),
    },
  };
}

/** Long enough for any reply an extension drafts, short of what WhatsApp itself allows. */
const Draft = Type.String({ minLength: 1, maxLength: 4096 });

/** Drafts only: the user reads, edits and sends them; nothing here sends (ADR 0004). */
/** Writes a draft with `write`, failing the call when no chat is open to take it. */
function drafting(write: (text: string) => Promise<boolean>): RpcMethod {
  return {
    capability: 'composer:insert-draft',
    params: Type.Tuple([Draft]),
    run: async ([text]) => {
      if (!(await write(text as string))) {
        throw new Error('No chat is open.');
      }
    },
  };
}

/** What an extension may show in the assistant bar: a little plain text, which YapYap never renders as markup. */
const Offer = Type.Object(
  {
    suggestions: Type.Array(Type.String({ minLength: 1, maxLength: 1000 }), { maxItems: 5 }),
    status: Type.Optional(Type.String({ maxLength: 200 })),
    confirm: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  },
  { additionalProperties: false },
);

/** The assistant bar (ADR 0013): an extension offers text; only YapYap's bar sends, on a click. */
function assistant(services: HostServices): Record<string, RpcMethod> {
  return {
    'assistant.offer': {
      capability: 'assistant:bar',
      params: Type.Tuple([Offer]),
      run: ([offer]) => {
        services.offerAssistant(offer as AssistantOffer);
        return Promise.resolve();
      },
    },
  };
}

function composer(services: HostServices): Record<string, RpcMethod> {
  return {
    'composer.insertDraft': drafting(services.insertDraft),
    'composer.replaceDraft': drafting(services.replaceDraft),
    // Reading what the user types is a grant of its own, apart from writing drafts (#105).
    'composer.readDraft': {
      capability: 'composer:read-draft',
      params: Type.Tuple([]),
      run: () => services.readDraft(),
    },
  };
}

/**
 * The host operations an extension can call, each behind the capability its
 * SDK documentation names. Operations not listed here are not offered yet.
 */
export function hostMethods(
  extension: CallingExtension,
  services: HostServices,
): Readonly<Record<string, RpcMethod>> {
  return {
    // An extension's own settings need no grant: the user filled them in for it.
    'settings.get': { params: Type.Tuple([]), run: () => Promise.resolve(extension.settings()) },
    ...notifications(extension, services),
    ...secrets(extension, services),
    ...storage(services),
    ...chat(services),
    ...composer(services),
    ...assistant(services),
  };
}
