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
}

/** This computer, by the names a local server answers on. */
const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Whether `url` reaches a server on this computer, over HTTP or HTTPS on any
 * port, without credentials. Only loopback counts: other machines on the
 * local network are not this computer.
 */
function isLocalServer(url: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const { protocol, username, password, hostname } = new URL(url);
  const web = protocol === 'http:' || protocol === 'https:';
  return web && username === '' && password === '' && LOOPBACK.has(hostname);
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
 * A request's fate without asking anyone: allowed or refused, or the host
 * the user would have to approve.
 */
function settled(url: string, home: string, deps: HostPolicyDependencies): boolean | string {
  if (url.startsWith(home)) {
    return true;
  }
  if (isLocalServer(url)) {
    return deps.local();
  }
  const host = httpsHost(url);
  return host === undefined ? false : deps.approved().includes(host) || host;
}

/**
 * Decides each request an extension page makes (ADR 0004, #95): its own files,
 * and HTTPS to hosts the user approved, go through. A new host the user
 * could approve, such as an AI service they set up, makes YapYap ask, one
 * host at a time; a host the user refused is not asked about again until
 * YapYap restarts. Everything else is cancelled.
 */
export function hostPolicy(deps: HostPolicyDependencies): (url: string) => Promise<boolean> {
  const home = `${extensionOrigin(deps.id)}/`;
  const refused = new Set<string>();
  const asking = new Map<string, Promise<boolean>>();
  const ask = async (host: string): Promise<boolean> => {
    const allowed = await deps.ask(deps.name(), host);
    if (allowed) {
      await deps.approve(host);
    } else {
      refused.add(host);
    }
    return allowed;
  };
  return (url) => {
    const host = settled(url, home, deps);
    if (typeof host === 'boolean') {
      return Promise.resolve(host);
    }
    const pending = asking.get(host);
    if (pending !== undefined) {
      return pending;
    }
    const askable = asking.size === 0 && !refused.has(host);
    if (!askable || !Value.Check(Hosts, [...deps.approved(), host])) {
      return Promise.resolve(false);
    }
    const answer = ask(host).finally(() => asking.delete(host));
    asking.set(host, answer);
    return answer;
  };
}
