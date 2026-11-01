import { globSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const RENDERER = resolve(import.meta.dirname, 'src/renderer');

/**
 * The chrome pages show the app icon, whose one source is the packaging
 * icon, so it is emitted from there rather than kept as a second copy.
 */
function appIcon(): Plugin {
  return {
    name: 'yapyap-app-icon',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'icon.svg',
        source: readFileSync(resolve(import.meta.dirname, 'build/icon.svg')),
      });
    },
  };
}

export default defineConfig({
  main: {
    resolve: {
      // fflate's Node build declares its own `require`, which clashes with the
      // one the bundle defines. Extension archives use only its synchronous
      // functions, which the browser build has without worker threads.
      alias: [{ find: /^fflate$/, replacement: 'fflate/browser' }],
    },
  },
  preload: {
    build: {
      rolldownOptions: {
        input: {
          chrome: resolve(import.meta.dirname, 'src/preload/chrome/index.ts'),
          whatsapp: resolve(import.meta.dirname, 'src/preload/whatsapp/index.ts'),
          extension: resolve(import.meta.dirname, 'src/preload/extension/index.ts'),
        },
        // Sandboxed preloads cannot load ES modules.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: RENDERER,
    plugins: [appIcon()],
    build: {
      // Every HTML shell in the renderer folder is a chrome page.
      rolldownOptions: {
        input: Object.fromEntries(
          globSync('*.html', { cwd: RENDERER }).map((page) => [
            basename(page, '.html'),
            resolve(RENDERER, page),
          ]),
        ),
      },
    },
  },
});
