/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('picker entry', () => {
  it('renders the picker with the preload API and cancels on Escape', async () => {
    const offer = vi.fn(() => new Promise<never>(() => undefined));
    const cancel = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, 'yapyap', {
      value: { picker: { offer, choose: vi.fn(), cancel } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Choose what to share');
      expect(offer).toHaveBeenCalledOnce();
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
