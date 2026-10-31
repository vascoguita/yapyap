import { extname, resolve, sep } from 'node:path';
import {
  HOST_SCRIPT_PATH,
  PANEL_PAGE_PATH,
  PANEL_STYLE_PATH,
  TEST_MODEL_PATH,
} from '../../shared/extension-rpc.ts';
import { hostScript } from './host-script.ts';
import { PANEL_STYLE } from './panel-style.ts';

export const EXTENSION_SCHEME = 'extension';

/**
 * ADR 0004: no eval, no inline or remote code, nothing but the extension's own
 * files. Requests may go to HTTPS, or to plain HTTP on this computer, which
 * the network policy then allows only with `local-network`.
 */
export const EXTENSION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  'connect-src https: http://localhost:* http://127.0.0.1:* http://[::1]:*',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The CSP of an extension holding `local-model` (#457), whose page runs a
 * model with an engine compiled to WebAssembly: it may compile WebAssembly,
 * though still never eval JavaScript, fetch its own files, such as the
 * engine's `.wasm`, and start workers from `blob:` URLs, which the engine
 * builds its threads from. Blob workers inherit this policy, so they load
 * nothing the page could not.
 */
export const LOCAL_MODEL_CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  'worker-src blob:',
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** The headers that set what an extension's pages may do, which depend on what it holds. */
type PolicyHeaders = Readonly<Record<string, string>>;

const STRICT: PolicyHeaders = { 'Content-Security-Policy': EXTENSION_CSP };

/**
 * Cross-origin isolation gives the page `SharedArrayBuffer`, which the
 * engine needs to run on several threads. Every response carries it, not
 * only the pages: a worker started from one of the extension's scripts takes
 * its policy from that script's response. Isolation makes the page refuse
 * cross-origin replies that do not opt in, and the HTTPS and local servers it
 * reaches answer with CORS, which counts as opting in.
 */
const LOCAL_MODEL: PolicyHeaders = {
  'Content-Security-Policy': LOCAL_MODEL_CSP,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export const extensionOrigin = (id: string): string => `${EXTENSION_SCHEME}://${id}`;

const JAVASCRIPT = 'text/javascript';

/** Static files an extension may ship; anything else is served as opaque bytes. */
const TYPES: Readonly<Record<string, string>> = {
  '.js': JAVASCRIPT,
  '.mjs': JAVASCRIPT,
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  // Streaming compilation refuses WebAssembly served under any other type.
  '.wasm': 'application/wasm',
};

const NOT_FOUND = 404;

function respond(
  body: ConstructorParameters<typeof Response>[0],
  type: string,
  policy: PolicyHeaders,
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': type,
      'Content-Security-Policy': EXTENSION_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...policy,
    },
  });
}

const notFound = (): Response => respond(null, 'text/plain', STRICT, NOT_FOUND);

/**
 * The page that starts the extension: extensions ship no HTML of their own, and
 * YapYap's bootstrap imports the entry module once the host API is ready.
 */
export const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><script type="module" src="${HOST_SCRIPT_PATH}"></script></head></html>`;

/**
 * The page of an extension's panel (#98), which loads YapYap's panel style and
 * then the module the manifest names. The schema allows only letters,
 * digits, `.`, `_`, `-` and `/` in that path, so it needs no escaping.
 */
export const panelPage = (entry: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${PANEL_STYLE_PATH}"><script type="module" src="/${entry}"></script></head><body></body></html>`;

/** The file `pathname` names inside `folder`, or undefined when it would leave it. */
function fileIn(folder: string, pathname: string): string | undefined {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname.slice(1));
  } catch {
    return undefined;
  }
  const path = resolve(folder, relative);
  return path.startsWith(folder + sep) ? path : undefined;
}

const HTML = 'text/html; charset=utf-8';

/** The pages and bootstrap YapYap serves for the extension, which no extension file can replace. */
function yapyapFile(
  pathname: string,
  source: ExtensionSource,
  policy: PolicyHeaders,
): Response | undefined {
  if (pathname === '/') {
    return respond(HOST_PAGE, HTML, policy);
  }
  if (pathname === HOST_SCRIPT_PATH) {
    return respond(hostScript(source.entry), JAVASCRIPT, policy);
  }
  if (pathname === PANEL_PAGE_PATH) {
    return source.panel === undefined ? notFound() : respond(panelPage(source.panel), HTML, policy);
  }
  if (pathname === PANEL_STYLE_PATH) {
    return respond(PANEL_STYLE, 'text/css', policy);
  }
  return undefined;
}

/**
 * The test model of an unpackaged YapYap's E2E tests (#457), only to an
 * extension holding `local-model`, the one that runs a model.
 */
const testModelFile = (model: string | undefined, policy: PolicyHeaders): Response =>
  model !== undefined && policy === LOCAL_MODEL
    ? respond(model, 'application/json', policy)
    : notFound();

/** Where a running extension's files are, and the module it starts from. */
export interface ExtensionSource {
  readonly folder: string;
  readonly entry: string;
  /** The module of the extension's panel, if it has one. */
  readonly panel: string | undefined;
}

/**
 * Serves `extension://<id>/` strictly from the extension's install folder, every
 * response under the extension CSP, or under the `local-model` one while
 * `localModel` says the extension holds that grant. `source` and
 * `localModel` are read per request, so an update takes effect without a new
 * handler, and taking the grant back applies from the page's next load.
 * `testModel` is only ever given by an unpackaged YapYap under E2E tests.
 */
export function serveExtensionFiles(
  id: string,
  source: () => ExtensionSource | undefined,
  readFile: (path: string) => Promise<Uint8Array>,
  localModel: () => boolean,
  testModel?: string,
): (request: { readonly url: string }) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const current = source();
    if (url.protocol !== `${EXTENSION_SCHEME}:` || url.host !== id || current === undefined) {
      return notFound();
    }
    const policy = localModel() ? LOCAL_MODEL : STRICT;
    if (url.pathname === TEST_MODEL_PATH) {
      return testModelFile(testModel, policy);
    }
    const own = yapyapFile(url.pathname, current, policy);
    if (own !== undefined) {
      return own;
    }
    return extensionFile(current.folder, url.pathname, policy, readFile);
  };
}

/** One of the extension's own files, with its type, or a 404 for anything else. */
async function extensionFile(
  folder: string,
  pathname: string,
  policy: PolicyHeaders,
  readFile: (path: string) => Promise<Uint8Array>,
): Promise<Response> {
  const path = fileIn(resolve(folder), pathname);
  if (path === undefined) {
    return notFound();
  }
  try {
    const bytes = await readFile(path);
    return respond(bytes, TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', policy);
  } catch {
    return notFound();
  }
}

/**
 * Cancels every request an extension page makes unless `decide` allows it:
 * the CSP lets HTTPS requests reach this filter, which only lets approved
 * hosts through (#95).
 */
export function confineExtensionRequests(
  decide: (url: string) => Promise<boolean>,
): (details: { readonly url: string }, callback: (response: { cancel: boolean }) => void) => void {
  return ({ url }, callback) => {
    decide(url).then(
      (allowed) => {
        callback({ cancel: !allowed });
      },
      () => {
        callback({ cancel: true });
      },
    );
  };
}
