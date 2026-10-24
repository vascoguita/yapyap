/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('proxy sign-in entry', () => {
  it('renders the sign-in page and closes on Escape', async () => {
    const request = vi.fn(() => new Promise(() => undefined));
    Object.defineProperty(window, 'yapyap', { value: { proxyLogin: { request } } });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Sign in to the proxy');
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
