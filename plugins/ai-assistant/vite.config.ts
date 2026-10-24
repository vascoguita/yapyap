import { defineConfig } from 'vite';

/**
 * One self-contained module per page YapYap loads: `main.js` for the
 * hidden page and `panel.js` for the panel, with the SDKs bundled in, since
 * a plugin can load nothing from outside its own folder. `public/` holds the
 * manifest, copied beside them.
 */
export default defineConfig({
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
