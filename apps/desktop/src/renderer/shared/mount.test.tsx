/** @vitest-environment happy-dom */
import { cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi } from '../../shared/api/chrome-api.ts';
import { mount } from './mount.tsx';

function Page({ api }: { readonly api: ChromeApi }) {
  return <h1>{api === globalThis.yapyap ? 'Has the API' : 'Wrong API'}</h1>;
}

describe('mount', () => {
  // Pages only pass the API on, so any object stands in for it.
  Object.defineProperty(window, 'yapyap', { value: {} });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('renders the page with the preload API and titles the window', () => {
    document.title = 'YapYap';
    mount(Page, { title: 'Downloads' });
    expect(document.body.querySelector('h1')?.textContent).toBe('Has the API');
    expect(document.title).toBe('Downloads');
  });

  it('keeps the page title when asked for none', () => {
    document.title = 'YapYap';
    mount(Page);
    expect(document.title).toBe('YapYap');
  });
});
