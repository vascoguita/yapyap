/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('about entry', () => {
  it('renders the About page with the preload API', async () => {
    const info = vi.fn(() => new Promise<never>(() => undefined));
    Object.defineProperty(window, 'yapyap', {
      value: { about: { info, copyTechnicalDetails: vi.fn() } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('YapYap');
      expect(info).toHaveBeenCalledOnce();
    });
  });
});
