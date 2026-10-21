import type { ChromeApi } from '../shared/chrome-api.ts';

declare global {
  /** Exposed by the chrome preload; the only way chrome pages reach the main process. */
  var yapyap: ChromeApi;
}
