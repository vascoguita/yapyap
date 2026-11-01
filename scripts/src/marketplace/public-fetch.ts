import { BlockList, isIP } from 'node:net';

/** One address a host name resolves to, as node:dns's `lookup` with `all: true` gives it. */
export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

/** Resolves a host name to every address it has. */
export type Resolve = (host: string) => Promise<readonly ResolvedAddress[]>;

/** What a request may carry: a plain GET, with redirects handed back to the caller. */
interface GetInit {
  readonly method: 'GET';
  readonly redirect: 'manual';
  readonly signal: AbortSignal;
}

/** Sends one request, as `fetch` does. */
export type HttpGet = (
  url: string,
  init: GetInit,
) => Promise<Pick<Response, 'status' | 'headers' | 'body'>>;

/** The network an address on the public internet is fetched through. */
export interface PublicNetwork {
  readonly get: HttpGet;
  readonly resolve: Resolve;
}

/**
 * A request this module will not make, or an answer it will not read: a
 * definite refusal, unlike a network error, which may pass.
 */
export class Refused extends Error {}

/** A redirect chain longer than this is refused: a release download needs one or two. */
const MAX_REDIRECTS = 5;

/** Where HTTP's classes of status begin: success, redirection and client error. */
const SUCCESS = 200;
const REDIRECTION = 300;
const CLIENT_ERROR = 400;

const isSuccess = (status: number): boolean => status >= SUCCESS && status < REDIRECTION;
const isRedirect = (status: number): boolean => status >= REDIRECTION && status < CLIENT_ERROR;

/**
 * Addresses that are not on the public internet. A hostile entry in a pull
 * request names the address CI fetches, so it must not reach the runner's
 * own services, the local network or a cloud metadata service. In order:
 * "this network", RFC 1918 private, carrier-grade NAT, loopback, link-local
 * (which holds cloud metadata services), RFC 1918 private, IETF protocol
 * assignments, RFC 1918 private, benchmarking, and multicast, reserved and
 * broadcast; then IPv6 unspecified, loopback, NAT64 (which can embed any
 * IPv4 address), unique local, link-local and multicast. IPv4-mapped IPv6
 * addresses are checked against the IPv4 ranges.
 */
const INTERNAL_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '224.0.0.0/3',
  '::/128',
  '::1/128',
  '64:ff9b::/96',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8',
];

const IPV6 = 6;
const typeOf = (family: number): 'ipv4' | 'ipv6' => (family === IPV6 ? 'ipv6' : 'ipv4');

const INTERNAL = new BlockList();
for (const range of INTERNAL_RANGES) {
  const [network = '', prefix = ''] = range.split('/');
  INTERNAL.addSubnet(network, Number(prefix), typeOf(isIP(network)));
}

/** Whether `address` is on the public internet. */
export function isPublicAddress({ address, family }: ResolvedAddress): boolean {
  return isIP(address) === family && !INTERNAL.check(address, typeOf(family));
}

/** The addresses `host` stands for; an IP address stands for itself. */
async function addressesOf(host: string, resolve: Resolve): Promise<readonly ResolvedAddress[]> {
  const bare = host.replace(/^\[(.*)\]$/, '$1');
  const family = isIP(bare);
  return family === 0 ? resolve(bare) : [{ address: bare, family }];
}

/** Refuses an address that is not HTTPS, carries credentials, or reaches an internal host. */
export async function checkAddress(url: URL, resolve: Resolve): Promise<void> {
  if (url.protocol !== 'https:') {
    throw new Refused('the latest address must use https:.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Refused('the latest address must not carry a user name or password.');
  }
  const addresses = await addressesOf(url.hostname, resolve);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new Refused(
      `${url.hostname} resolves to an address that is not on the public internet, such as a loopback, private or link-local one.`,
    );
  }
}

/** Reads a body up to `maxBytes`, aborting the download past it. */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  abort: () => void,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body ?? []) {
    total += chunk.length;
    if (total > maxBytes) {
      abort();
      throw new Refused(`the latest address served more than ${String(maxBytes)} bytes.`);
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** The address a redirect points at, resolved against the one that sent it. */
function redirectTarget(url: URL, headers: Headers): URL {
  const location = headers.get('location');
  if (location === null) {
    throw new Refused('the latest address redirected without saying where.');
  }
  return new URL(location, url);
}

/** What a public address finally answers: its status, and its body when it is a success. */
export interface PublicAnswer {
  readonly status: number;
  readonly bytes: Uint8Array | undefined;
}

/**
 * GETs `address` on the public internet only: HTTPS, no credentials in the
 * address, and every host it resolves to public. Each redirect is checked
 * the same way before it is followed, and a body larger than `maxBytes` is
 * refused as it streams in. DNS is asked again when the request connects,
 * so a host that answers differently the second time is the one gap left;
 * CI runs this with no secrets and read-only permissions.
 */
export async function publicGet(
  address: string,
  network: PublicNetwork,
  maxBytes: number,
): Promise<PublicAnswer> {
  let url = new URL(address);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await checkAddress(url, network.resolve);
    const controller = new AbortController();
    const init = { method: 'GET', redirect: 'manual', signal: controller.signal } as const;
    const response = await network.get(url.href, init);
    const abort = () => {
      controller.abort();
    };
    if (isSuccess(response.status)) {
      return { status: response.status, bytes: await readCapped(response.body, maxBytes, abort) };
    }
    // Nothing but a success's body is read; the rest of an answer is dropped.
    abort();
    if (!isRedirect(response.status)) {
      return { status: response.status, bytes: undefined };
    }
    url = redirectTarget(url, response.headers);
  }
  throw new Refused(`the latest address redirected more than ${String(MAX_REDIRECTS)} times.`);
}
