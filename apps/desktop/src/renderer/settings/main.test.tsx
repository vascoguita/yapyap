/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('settings entry', () => {
  it('renders the settings page with the preload API and closes on Escape', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const get = vi.fn(() => new Promise<never>(() => undefined));
    Object.defineProperty(window, 'yapyap', {
      value: {
        settings: { get, set: vi.fn(), restart: vi.fn(), export: vi.fn(), import: vi.fn() },
      },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Settings');
      expect(get).toHaveBeenCalledOnce();
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
