import { ManifestSchema } from '@yapyap/extension-sdk';
import { Value } from 'typebox/value';
import { extensionOrigin } from './extension-files.ts';

/** The hosts an extension may hold, as its manifest and record allow them: plain names, at most 32. */
const Hosts = ManifestSchema.properties.network.properties.hosts;

export interface HostPolicyDependencies {
  readonly id: string;
  /** The extension's name, for the prompt. */
  readonly name: () => string;
  /** The hosts the user approved for it. */
  readonly approved: () => readonly string[];
  /** Asks the user whether the extension may reach `host`. */
  readonly ask: (extension: string, host: string) => Promise<boolean>;
  /** Adds `host` to the extension's approved hosts, for good. */
  readonly approve: (host: string) => Promise<void>;
  /** Whether the user lets the extension reach servers on this computer (`local-network`). */
  readonly local: () => boolean;
  /** The servers on this computer the user approved for it, such as `localhost:11434`. */
  readonly approvedLocal: () => readonly string[];
  /** Asks the user whether the extension may use `server` on this computer (#430). */
  readonly askLocal: (extension: string, server: string) => Promise<boolean>;
  /** Adds `server` to the extension's approved servers on this computer, for good. */
  readonly approveLocal: (server: string) => Promise<void>;
}

/** The most servers on this computer an extension may hold; a model server or two is the use. */
export const MAX_LOCAL_SERVERS = 8;

/** A request the user would have to approve: a host on the internet, or a server on this computer. */
interface Askable {
  readonly name: string;
  readonly local: boolean;
}

/** This computer, by the names a local server answers on. */
const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

const DEFAULT_PORTS: Readonly<Record<string, string>> = { 'http:': '80', 'https:': '443' };

/**
 * The server on this computer that `url` reaches over HTTP or HTTPS without
 * credentials, as `host:port`, or undefined for anything else. Only loopback
 * counts: other machines on the local network are not this computer.
 */
function localServer(url: string): string | undefined {
  if (!URL.canParse(url)) {
    return undefined;
  }
  const { protocol, username, password, hostname, port } = new URL(url);
  const fallback = DEFAULT_PORTS[protocol];
  const plain = fallback !== undefined && username === '' && password === '';
  return plain && LOOPBACK.has(hostname) ? `${hostname}:${port || fallback}` : undefined;
}

/** The host of a plain `https://` URL on the default port, or undefined for anything else. */
function httpsHost(url: string): string | undefined {
  if (!URL.canParse(url)) {
    return undefined;
  }
  const { protocol, port, username, password, hostname } = new URL(url);
  const plain = protocol === 'https:' && port === '' && username === '' && password === '';
  return plain ? hostname : undefined;
}

/**
 * Whether the extension may use a server on this computer now: it holds
 * `local-network`, and the user approved that server (#430).
 */
export function reachesLocal(
  url: string,
  deps: Pick<HostPolicyDependencies, 'local' | 'approvedLocal'>,
): boolean {
  const server = localServer(url);
  return server !== undefined && deps.local() && deps.approvedLocal().includes(server);
}

/** Whether one more approval still fits in what the extension may hold. */
function fits(asked: Askable, deps: HostPolicyDependencies): boolean {
  return asked.local
    ? deps.approvedLocal().length < MAX_LOCAL_SERVERS
    : Value.Check(Hosts, [...deps.approved(), asked.name]);
}

/** A server on this computer: allowed when approved, askable with `local-network`, refused otherwise. */
function settledLocal(server: string, deps: HostPolicyDependencies): boolean | Askable {
  if (!deps.local()) {
    return false;
  }
  return deps.approvedLocal().includes(server) || { name: server, local: true };
}

/**
 * A request's fate without asking anyone: allowed or refused, or what the
 * user would have to approve.
 */
function settled(url: string, home: string, deps: HostPolicyDependencies): boolean | Askable {
  if (url.startsWith(home)) {
    return true;
  }
  const server = localServer(url);
  if (server !== undefined) {
    return settledLocal(server, deps);
  }
  const host = httpsHost(url);
  if (host === undefined) {
    return false;
  }
  return deps.approved().includes(host) || { name: host, local: false };
}

/**
 * Decides each request an extension page makes (ADR 0004, #95): its own files,
 * HTTPS to hosts the user approved, and, with `local-network`, servers on
 * this computer the user approved (#430) go through. A new host or local
 * server the user could approve, such as an AI service they set up, makes
 * YapYap ask, one at a time; one the user refused is not asked about again
 * until YapYap restarts. Everything else is cancelled.
 */
export function hostPolicy(deps: HostPolicyDependencies): (url: string) => Promise<boolean> {
  const home = `${extensionOrigin(deps.id)}/`;
  const refused = new Set<string>();
  const asking = new Map<string, Promise<boolean>>();
  const ask = async ({ name, local }: Askable): Promise<boolean> => {
    const allowed = await (local ? deps.askLocal : deps.ask)(deps.name(), name);
    if (allowed) {
      await (local ? deps.approveLocal : deps.approve)(name);
    } else {
      refused.add(name);
    }
    return allowed;
  };
  return (url) => {
    const asked = settled(url, home, deps);
    if (typeof asked === 'boolean') {
      return Promise.resolve(asked);
    }
    const pending = asking.get(asked.name);
    if (pending !== undefined) {
      return pending;
    }
    const askable = asking.size === 0 && !refused.has(asked.name);
    if (!askable || !fits(asked, deps)) {
      return Promise.resolve(false);
    }
    const answer = ask(asked).finally(() => asking.delete(asked.name));
    asking.set(asked.name, answer);
    return answer;
  };
}
