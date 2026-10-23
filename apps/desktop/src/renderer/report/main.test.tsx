/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('report entry', () => {
  it('renders the problem report', async () => {
    Object.defineProperty(window, 'yapyap', {
      value: { report: { diagnostics: vi.fn(() => Promise.resolve('')) } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Report a Problem');
    });
  });
});
