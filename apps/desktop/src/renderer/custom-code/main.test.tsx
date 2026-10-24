/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('custom code entry', () => {
  it('renders the Custom CSS and JavaScript page and closes on Escape', async () => {
    const get = vi.fn(() => new Promise(() => undefined));
    Object.defineProperty(window, 'yapyap', { value: { customCode: { get } } });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Custom CSS and JavaScript');
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
