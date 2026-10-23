/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('plugins entry', () => {
  it('renders the Plugins page', async () => {
    Object.defineProperty(window, 'yapyap', {
      value: {
        plugins: { list: vi.fn(() => Promise.resolve({ plugins: [], developerMode: false })) },
      },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Plugins');
    });
  });
});
