/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('shortcuts entry', () => {
  it('renders the Keyboard Shortcuts page and closes on Escape', async () => {
    const list = vi.fn(() => new Promise(() => undefined));
    Object.defineProperty(window, 'yapyap', { value: { shortcuts: { list } } });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Keyboard shortcuts');
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
