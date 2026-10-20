import type { ChromeApi } from '../shared/chrome-api.ts';

declare global {
  interface Window {
    /** Exposed by the chrome preload; the only way chrome pages reach the main process. */
    readonly yapyap: ChromeApi;
  }
}
