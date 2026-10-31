import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * The private model's engine (#457): wllama's one WebAssembly build, shipped
 * beside `main.js` under a fixed name, so the signed extension holds every
 * byte that runs and nothing is fetched from a CDN.
 */
function engineWasm(): Plugin {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@wllama/wllama/esm/index.js');
  return {
    name: 'engine-wasm',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'wllama.wasm',
        source: readFileSync(join(dirname(entry), 'wasm', 'wllama.wasm')),
      });
    },
  };
}

/**
 * One self-contained module per page YapYap loads: `main.js` for the
 * hidden page and `panel.js` for the panel, with the SDKs and the engine
 * bundled in, since an extension can load nothing from outside its own
 * folder. `public/` holds the manifest, copied beside them.
 */
export default defineConfig({
  plugins: [engineWasm()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2024',
    lib: {
      entry: { main: 'src/main.ts', panel: 'src/panel-entry.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
  },
});
