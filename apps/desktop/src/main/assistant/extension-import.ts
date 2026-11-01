import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { localServerOf } from '../../shared/local-server.ts';
import { writeTextAtomically } from '../atomic-write.ts';
import { RECORDS_FILE } from '../extensions/records.ts';
import { keyValueStore, removeStore } from '../extensions/key-value-store.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import type { SettingsService } from '../settings/service.ts';
import type { AllowedChats } from './chats.ts';
import type { AssistantKeys, KeyedProvider } from './keys.ts';
import type { AssistantSettings } from './setup.ts';
import type { AssistantNotice, AssistantState } from './state.ts';

/** The AI assistant extension, which YapYap now is (ADR 0017). */
export const ASSISTANT_EXTENSION = 'org.guita.yapyap.ai-assistant';

export interface ImportSources {
  /** Where extensions are installed, such as `<userData>/extensions`. */
  readonly root: string;
  /** Where extensions keep their key-value stores. */
  readonly storage: string;
  readonly extensionSecrets: Pick<SecretStore, 'get' | 'forgetAll'>;
  /** Deletes what the extension's session kept, such as its downloaded model. */
  readonly clearPartition: (id: string) => Promise<void>;
  readonly keys: Pick<AssistantKeys, 'get' | 'save'>;
  readonly settings: Pick<SettingsService, 'current' | 'update'>;
  readonly chats: Pick<AllowedChats, 'adopt'>;
  /** Every account's ID. */
  readonly accounts: () => readonly string[];
  readonly state: Pick<AssistantState, 'setNotice'>;
}

type Values = Readonly<Record<string, unknown>>;

/** The records file as it is, read without its schema, which no longer knows the extension's grants. */
async function rawRecords(root: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(root, RECORDS_FILE), 'utf8')) as unknown;
    return Object(parsed) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** The extension's record, if it is installed. */
function recordIn(records: Record<string, unknown> | undefined): Values | undefined {
  const extensions = Object(records?.['extensions']) as Record<string, unknown>;
  const record = extensions[ASSISTANT_EXTENSION];
  return record === undefined ? undefined : (Object(record) as Values);
}

const KEYED: ReadonlySet<unknown> = new Set(['anthropic', 'openai']);

/** A model server on this computer, as the assistant's settings take it; nothing for anything else. */
function localOf(endpoint: unknown): Partial<AssistantSettings> {
  const local = typeof endpoint === 'string' ? localServerOf(endpoint) : undefined;
  return local === undefined ? {} : { provider: 'local', localServer: local };
}

/** The provider the extension had, from its settings form or what it kept besides. */
function providerOf(chosen: Values, kept: (key: string) => unknown): Partial<AssistantSettings> {
  if (KEYED.has(chosen['provider'])) {
    return { provider: chosen['provider'] as KeyedProvider };
  }
  if (chosen['provider'] === 'compatible') {
    return localOf(chosen['endpoint']);
  }
  if (chosen['provider'] === 'built-in' || kept('builtIn') !== undefined) {
    return { provider: 'built-in' };
  }
  return localOf((Object(kept('localServer')) as Values)['endpoint']);
}

/** The message counts the extension's settings form offered: a few, its default, or more. */
const FEW = 5;
const SOME = 10;
const MANY = 20;
const CONTEXTS: ReadonlyMap<unknown, AssistantSettings['messages']> = new Map([
  [FEW, '5'],
  [SOME, '10'],
  [MANY, '20'],
]);
const MAX_MODEL = 200;

/** What the assistant's settings take from the extension's. */
function settingsFrom(chosen: Values, kept: (key: string) => unknown): Partial<AssistantSettings> {
  const model = kept('model');
  const messages = CONTEXTS.get(chosen['context']);
  return {
    ...providerOf(chosen, kept),
    ...(typeof model === 'string' && model !== '' && model.length <= MAX_MODEL ? { model } : {}),
    ...(messages === undefined ? {} : { messages }),
  };
}

/** Moves the extension's keys over, unless YapYap already has one of its own. */
async function importKeys(sources: ImportSources): Promise<void> {
  await Promise.all(
    (['anthropic', 'openai'] as const).map(async (provider) => {
      const key = await sources.extensionSecrets.get(`${ASSISTANT_EXTENSION}/apiKey.${provider}`);
      const own = await sources.keys.get(provider);
      if (key !== undefined && own === undefined) {
        await sources.keys.save(provider, key);
      }
    }),
  );
}

/** Uninstalls the extension: its record, its files, its storage, its secrets and its session. */
async function uninstall(sources: ImportSources, records: Record<string, unknown>): Promise<void> {
  const extensions = Object(records['extensions']) as Record<string, unknown>;
  const others = Object.fromEntries(
    Object.entries(extensions).filter(([id]) => id !== ASSISTANT_EXTENSION),
  );
  const text = `${JSON.stringify({ ...records, extensions: others }, null, 2)}\n`;
  writeTextAtomically(join(sources.root, RECORDS_FILE), text);
  await rm(join(sources.root, ASSISTANT_EXTENSION), { recursive: true, force: true });
  await removeStore(sources.storage, ASSISTANT_EXTENSION);
  sources.extensionSecrets.forgetAll(`${ASSISTANT_EXTENSION}/`);
  await sources.clearPartition(ASSISTANT_EXTENSION);
}

/**
 * The AI assistant became part of YapYap (ADR 0017). If its extension is
 * installed, this takes over what the user set up there: the provider,
 * the model picked, how many messages to send, the API keys and the chats
 * it was allowed in. Then it uninstalls the extension and leaves a
 * one-time note for the bar. The private model the extension downloaded
 * lived in its own storage, so the note asks to download it again. True
 * when there was an extension to take over.
 */
export async function importAssistantExtension(sources: ImportSources): Promise<boolean> {
  const records = await rawRecords(sources.root);
  const record = recordIn(records);
  if (records === undefined || record === undefined) {
    return false;
  }
  const store = keyValueStore(sources.storage, ASSISTANT_EXTENSION);
  const chosen = Object(record['settings']) as Values;
  const imported = settingsFrom(chosen, store.get);
  await importKeys(sources);
  const allowed = store.get('allowedChats');
  sources.chats.adopt(Array.isArray(allowed) ? allowed : [], sources.accounts());
  const notice: AssistantNotice = imported.provider === 'built-in' ? 'moved-redownload' : 'moved';
  sources.state.setNotice(notice);
  // Last, since the bar shows the setup anew when the settings change.
  sources.settings.update((settings) => ({
    ...settings,
    assistant: { ...settings.assistant, ...imported },
  }));
  await uninstall(sources, records);
  return true;
}
