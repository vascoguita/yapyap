/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('downloads entry', () => {
  it('renders the Downloads page and closes on Escape', async () => {
    const list = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(window, 'yapyap', { value: { downloads: { list } } });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Downloads');
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
