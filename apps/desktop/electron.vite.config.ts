import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    resolve: {
      // fflate's Node build declares its own `require`, which clashes with the
      // one the bundle defines. Plugin archives use only its synchronous
      // functions, which the browser build has without worker threads.
      alias: [{ find: /^fflate$/, replacement: 'fflate/browser' }],
    },
  },
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
          welcome: resolve(import.meta.dirname, 'src/renderer/welcome.html'),
          report: resolve(import.meta.dirname, 'src/renderer/report.html'),
          sidebar: resolve(import.meta.dirname, 'src/renderer/sidebar.html'),
          plugins: resolve(import.meta.dirname, 'src/renderer/plugins.html'),
          'plugin-consent': resolve(import.meta.dirname, 'src/renderer/plugin-consent.html'),
          shortcuts: resolve(import.meta.dirname, 'src/renderer/shortcuts.html'),
          'custom-code': resolve(import.meta.dirname, 'src/renderer/custom-code.html'),
          'quick-panel': resolve(import.meta.dirname, 'src/renderer/quick-panel.html'),
          downloads: resolve(import.meta.dirname, 'src/renderer/downloads.html'),
          'spelling-languages': resolve(
            import.meta.dirname,
            'src/renderer/spelling-languages.html',
          ),
          'proxy-login': resolve(import.meta.dirname, 'src/renderer/proxy-login.html'),
        },
      },
    },
  },
});
