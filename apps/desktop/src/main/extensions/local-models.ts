import type { LocalModelServer } from '@yapyap/extension-sdk';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import type { Fetcher } from '../marketplace/index-client.ts';
import { cappedFetcher, type StreamedResponse } from '../marketplace/fetch.ts';

const OLLAMA_PORT = 11_434;
/** Alpaca runs an Ollama of its own, one port up, so both can run. */
const ALPACA_PORT = 11_435;
const LM_STUDIO_PORT = 1234;
const LLAMA_CPP_PORT = 8080;

/** Where people's model servers usually listen (#456). */
export const MODEL_SERVER_PORTS: readonly number[] = [
  OLLAMA_PORT,
  ALPACA_PORT,
  LM_STUDIO_PORT,
  LLAMA_CPP_PORT,
];

/** How long each server has to answer; all are asked at once, so the user waits this long at most. */
export const PROBE_TIMEOUT_MS = 1500;

/** Far more than a list of models takes, short of what could fill memory. */
export const LIST_MAX_BYTES = 256 * 1024;

const MAX_SERVERS = 4;
const MAX_MODELS = 20;

/** A model's ID as an extension may get it: short text, without control characters. */
const ModelId = Type.String({ minLength: 1, maxLength: 200, pattern: String.raw`^\P{Cc}+$` });

/** What an extension gets back, checked once more before it leaves the main process. */
const FoundServers = Type.Array(
  Type.Object(
    {
      server: Type.String({ pattern: '^localhost:[0-9]{1,5}$' }),
      endpoint: Type.String({ pattern: '^http://localhost:[0-9]{1,5}/v1$' }),
      models: Type.Array(ModelId, { maxItems: MAX_MODELS }),
    },
    { additionalProperties: false },
  ),
  { maxItems: MAX_SERVERS },
);

/** How YapYap looks for model servers on this computer. */
export interface ModelServerProbe {
  /** The ports to ask, always on 127.0.0.1. */
  readonly ports: readonly number[];
  /** One plain GET, which follows no redirect and sends no cookie. */
  readonly request: (url: string) => Promise<StreamedResponse>;
}

/**
 * A GET to a server on this computer with Node's own `fetch`, which keeps no
 * cookies, unlike a session's: it follows no redirect, so a server cannot
 * send YapYap anywhere else, sends no credentials, and gives up after
 * `timeoutMs`, reading the body included.
 */
export const loopbackRequest =
  (fetcher: typeof fetch, timeoutMs = PROBE_TIMEOUT_MS) =>
  (url: string): Promise<StreamedResponse> =>
    fetcher(url, {
      redirect: 'error',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

/** The IDs an OpenAI-style list of models names, the first 20 that fit; undefined when it is no such list. */
export function modelIds(bytes: Uint8Array): string[] | undefined {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
  const { data } = Object(body) as { data?: unknown };
  if (!Array.isArray(data)) {
    return undefined;
  }
  return (data as unknown[])
    .map((entry) => (Object(entry) as { id?: unknown }).id)
    .filter((id): id is string => Value.Check(ModelId, id))
    .slice(0, MAX_MODELS);
}

async function probeOne(port: number, list: Fetcher): Promise<LocalModelServer | undefined> {
  const bytes = await list(`http://127.0.0.1:${String(port)}/v1/models`);
  const models = bytes === undefined ? undefined : modelIds(bytes);
  // Extensions reach the server as `localhost`, the name YapYap's prompts and docs use.
  return models === undefined
    ? undefined
    : {
        server: `localhost:${String(port)}`,
        endpoint: `http://localhost:${String(port)}/v1`,
        models,
      };
}

/**
 * The model servers on this computer that answer at `probe.ports` (#456),
 * in that order: each is asked once, at the same time, for its list of
 * models (`GET /v1/models`, which Ollama, LM Studio and llama.cpp all
 * serve), and nothing else. Only loopback is asked. Nothing is logged:
 * which models someone runs is theirs.
 */
export async function findLocalModels(probe: ModelServerProbe): Promise<LocalModelServer[]> {
  const list = cappedFetcher(probe.request, LIST_MAX_BYTES);
  const answered = await Promise.all(probe.ports.map((port) => probeOne(port, list)));
  const servers = answered
    .filter((server): server is LocalModelServer => server !== undefined)
    .slice(0, MAX_SERVERS);
  return Value.Check(FoundServers, servers) ? servers : [];
}

const TEST_PORTS = 'YAPYAP_TEST_MODEL_PORTS';

const isPort = (port: number): boolean => Number.isInteger(port) && port > 0 && port < 65_536;

/**
 * The ports to look at. E2E tests run an unpackaged build against fake
 * servers on ports of their own, listed in `YAPYAP_TEST_MODEL_PORTS`;
 * a packaged build ignores it, so no installed YapYap looks anywhere else.
 */
export function modelServerPorts(
  env: Readonly<Record<string, string | undefined>>,
  packaged: boolean,
): readonly number[] {
  const given = env[TEST_PORTS];
  if (packaged || given === undefined) {
    return MODEL_SERVER_PORTS;
  }
  const ports = given.split(',').map(Number);
  return ports.length <= MAX_SERVERS && ports.every(isPort) ? ports : MODEL_SERVER_PORTS;
}
