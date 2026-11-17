import { render, type ComponentType } from 'preact';
import type { ChromeApi } from '../../shared/api/chrome-api.ts';

interface MountOptions {
  /**
   * The window's title, from the catalog, so it is translated with the page
   * (ADR 0012). Views laid into another window keep the page's own.
   */
  readonly title?: string;
}

/** Starts a chrome page: its title and the page itself, with the preload's API. */
export function mount(
  Page: ComponentType<{ readonly api: ChromeApi }>,
  { title }: MountOptions = {},
): void {
  const api = globalThis.yapyap;
  if (title !== undefined) {
    document.title = title;
  }
  render(<Page api={api} />, document.body);
}
