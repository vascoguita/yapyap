/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('report entry', () => {
  it('renders the problem report, which closes on Escape', async () => {
    Object.defineProperty(window, 'yapyap', {
      value: { report: { diagnostics: vi.fn(() => Promise.resolve('')) } },
    });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Report a Problem');
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
