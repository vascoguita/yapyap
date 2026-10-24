import { ManifestSchema } from '@yapyap/plugin-sdk';
import { Value } from 'typebox/value';
import { pluginOrigin } from './plugin-files.ts';

/** The hosts a plugin may hold, as its manifest and record allow them: plain names, at most 32. */
const Hosts = ManifestSchema.properties.network.properties.hosts;

export interface HostPolicyDependencies {
  readonly id: string;
  /** The plugin's name, for the prompt. */
  readonly name: () => string;
  /** The hosts the user approved for it. */
  readonly approved: () => readonly string[];
  /** Asks the user whether the plugin may reach `host`. */
  readonly ask: (plugin: string, host: string) => Promise<boolean>;
  /** Adds `host` to the plugin's approved hosts, for good. */
  readonly approve: (host: string) => Promise<void>;
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
 * Decides each request a plugin page makes (ADR 0004, #95): its own files,
 * and HTTPS to hosts the user approved, go through. A new host the user
 * could approve, such as an AI service they set up, makes YapYap ask, one
 * host at a time; a host the user refused is not asked about again until
 * YapYap restarts. Everything else is cancelled.
 */
export function hostPolicy(deps: HostPolicyDependencies): (url: string) => Promise<boolean> {
  const home = `${pluginOrigin(deps.id)}/`;
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
  const settled = (url: string): boolean | string => {
    if (url.startsWith(home)) {
      return true;
    }
    const host = httpsHost(url);
    return host === undefined ? false : deps.approved().includes(host) || host;
  };
  return (url) => {
    const host = settled(url);
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
