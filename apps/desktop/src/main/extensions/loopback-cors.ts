import { extensionOrigin } from './extension-files.ts';
import { reachesLocal, type HostPolicyDependencies } from './network-policy.ts';

type RequestHeaders = Record<string, string>;
type ResponseHeaders = Record<string, string[]>;

interface SentRequest {
  readonly url: string;
  readonly requestHeaders: RequestHeaders;
}

interface ReceivedResponse {
  readonly url: string;
  readonly method: string;
  readonly responseHeaders?: ResponseHeaders;
}

/** A response's headers and status line as YapYap rewrote them, or nothing to keep them. */
interface RewrittenResponse {
  readonly responseHeaders?: ResponseHeaders;
  readonly statusLine?: string;
}

export interface LoopbackCorsDependencies extends Pick<
  HostPolicyDependencies,
  'local' | 'approvedLocal'
> {
  readonly id: string;
  /** What every session does to request headers, which this listener replaces (one per session). */
  readonly present: (headers: Readonly<RequestHeaders>) => RequestHeaders;
}

/** Headers named case-insensitively, as servers send them. */
const without = <T>(headers: Readonly<Record<string, T>>, drop: (name: string) => boolean) =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => !drop(name.toLowerCase())));

/**
 * Local model servers such as Ollama refuse a request whose `Origin` they do
 * not list, and an extension's `extension://` origin is on no such list
 * (#430). So requests to a server on this computer the user approved for
 * the extension, which must hold `local-network`, leave without an
 * `Origin`, and YapYap answers CORS for them itself, so the page can read
 * the reply. Other servers on this computer stay unreachable, and other
 * requests and extensions are left alone (ADR 0004).
 */
export function loopbackCors(deps: LoopbackCorsDependencies): {
  readonly beforeSendHeaders: (details: SentRequest) => RequestHeaders;
  readonly headersReceived: (details: ReceivedResponse) => RewrittenResponse;
} {
  const applies = (url: string): boolean => reachesLocal(url, deps);
  return {
    beforeSendHeaders: (details: SentRequest): RequestHeaders => {
      const headers = deps.present(details.requestHeaders);
      return applies(details.url) ? without(headers, (name) => name === 'origin') : headers;
    },
    headersReceived: (details: ReceivedResponse): RewrittenResponse => {
      if (!applies(details.url)) {
        return {};
      }
      const responseHeaders = {
        ...without(details.responseHeaders ?? {}, (name) => name.startsWith('access-control-')),
        'Access-Control-Allow-Origin': [extensionOrigin(deps.id)],
        // A wildcard does not cover Authorization, which API clients send even to local servers.
        'Access-Control-Allow-Headers': ['*, Authorization'],
        'Access-Control-Allow-Methods': ['*'],
      };
      // Without an Origin, a server may not treat OPTIONS as a preflight and answer it as an error.
      return details.method === 'OPTIONS'
        ? { responseHeaders, statusLine: 'HTTP/1.1 204 No Content' }
        : { responseHeaders };
    },
  };
}
