import { extname, resolve, sep } from 'node:path';
import { HOST_SCRIPT_PATH, PANEL_PAGE_PATH } from '../../shared/plugin-rpc.ts';
import { hostScript } from './host-script.ts';

export const PLUGIN_SCHEME = 'plugin';

/** ADR 0004: no eval, no inline or remote code, nothing but the plugin's own files. */
export const PLUGIN_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https:";

export const pluginOrigin = (id: string): string => `${PLUGIN_SCHEME}://${id}`;

const JAVASCRIPT = 'text/javascript';

/** Static files a plugin may ship; anything else is served as opaque bytes. */
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
};

const NOT_FOUND = 404;

function respond(
  body: ConstructorParameters<typeof Response>[0],
  type: string,
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': type,
      'Content-Security-Policy': PLUGIN_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}

const notFound = (): Response => respond(null, 'text/plain', NOT_FOUND);

/**
 * The page that starts the plugin: plugins ship no HTML of their own, and
 * YapYap's bootstrap imports the entry module once the host API is ready.
 */
export const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><script type="module" src="${HOST_SCRIPT_PATH}"></script></head></html>`;

/**
 * The page of a plugin's panel (#98), which loads the module the manifest
 * names. The schema allows only letters, digits, `.`, `_`, `-` and `/` in
 * that path, so it needs no escaping.
 */
export const panelPage = (entry: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><script type="module" src="/${entry}"></script></head><body></body></html>`;

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

/** The pages and bootstrap YapYap serves for the plugin, which no plugin file can replace. */
function yapyapFile(pathname: string, source: PluginSource): Response | undefined {
  switch (pathname) {
    case '/':
      return respond(HOST_PAGE, HTML);
    case HOST_SCRIPT_PATH:
      return respond(hostScript(source.entry), JAVASCRIPT);
    case PANEL_PAGE_PATH:
      return source.panel === undefined ? notFound() : respond(panelPage(source.panel), HTML);
    default:
      return undefined;
  }
}

/** Where a running plugin's files are, and the module it starts from. */
export interface PluginSource {
  readonly folder: string;
  readonly entry: string;
  /** The module of the plugin's panel, if it has one. */
  readonly panel: string | undefined;
}

/**
 * Serves `plugin://<id>/` strictly from the plugin's install folder, every
 * response under the plugin CSP. `source` is read per request, so an
 * update takes effect without a new handler.
 */
export function servePluginFiles(
  id: string,
  source: () => PluginSource | undefined,
  readFile: (path: string) => Promise<Uint8Array>,
): (request: { readonly url: string }) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const current = source();
    if (url.protocol !== `${PLUGIN_SCHEME}:` || url.host !== id || current === undefined) {
      return notFound();
    }
    const own = yapyapFile(url.pathname, current);
    if (own !== undefined) {
      return own;
    }
    const path = fileIn(resolve(current.folder), url.pathname);
    if (path === undefined) {
      return notFound();
    }
    try {
      const bytes = await readFile(path);
      return respond(bytes, TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream');
    } catch {
      return notFound();
    }
  };
}

/**
 * Cancels every request a plugin page makes unless `decide` allows it:
 * the CSP lets HTTPS requests reach this filter, which only lets approved
 * hosts through (#95).
 */
export function confinePluginRequests(
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
