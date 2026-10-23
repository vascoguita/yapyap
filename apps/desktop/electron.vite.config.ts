import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          chrome: resolve(import.meta.dirname, 'src/preload/chrome/index.ts'),
          whatsapp: resolve(import.meta.dirname, 'src/preload/whatsapp/index.ts'),
        },
        // Sandboxed preloads cannot load ES modules.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          about: resolve(import.meta.dirname, 'src/renderer/about.html'),
          recovery: resolve(import.meta.dirname, 'src/renderer/recovery.html'),
          settings: resolve(import.meta.dirname, 'src/renderer/settings.html'),
          picker: resolve(import.meta.dirname, 'src/renderer/picker.html'),
          'new-chat': resolve(import.meta.dirname, 'src/renderer/new-chat.html'),
          accounts: resolve(import.meta.dirname, 'src/renderer/accounts.html'),
          sidebar: resolve(import.meta.dirname, 'src/renderer/sidebar.html'),
        },
      },
    },
  },
});
