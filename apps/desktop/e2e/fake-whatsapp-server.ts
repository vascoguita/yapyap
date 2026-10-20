import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'test', 'fake-whatsapp');
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export interface FakeWhatsApp {
  readonly origin: string;
  close(): Promise<void>;
}

function resolvePath(url: string | undefined, home: string): string | undefined {
  const pathname = new URL(url ?? '/', 'http://127.0.0.1').pathname;
  const file = normalize(join(ROOT, pathname === '/' ? home : pathname));
  return file.startsWith(ROOT + sep) ? file : undefined;
}

/** `home` is the page served at `/`, so tests can stage WhatsApp's failure modes. */
export async function startFakeWhatsApp(home = 'index.html'): Promise<FakeWhatsApp> {
  const server: Server = createServer((request, response) => {
    // Lets tests check what WhatsApp would see: the user agent and client hints.
    if (request.url === '/__headers') {
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(request.headers));
      return;
    }
    const file = resolvePath(request.url, home);
    if (file === undefined) {
      response.writeHead(404).end();
      return;
    }
    readFile(file).then(
      (body) =>
        response
          .writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
          .end(body),
      () => response.writeHead(404).end(),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
