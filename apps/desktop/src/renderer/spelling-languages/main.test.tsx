/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('spelling languages entry', () => {
  it('renders the Spelling Languages page and closes on Escape', async () => {
    const languages = vi.fn(() =>
      Promise.resolve({ enabled: true, available: [], chosen: [], inUse: [] }),
    );
    Object.defineProperty(window, 'yapyap', { value: { spelling: { languages } } });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Spelling languages');
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
