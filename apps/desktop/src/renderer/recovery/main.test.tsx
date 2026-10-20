/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('recovery entry', () => {
  it('renders the recovery screen with the preload API', async () => {
    const problem = vi.fn(() => Promise.resolve({ kind: 'load-failed', description: 'x' }));
    Object.defineProperty(window, 'yapyap', {
      value: {
        recovery: { problem, retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
      },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('WhatsApp could not be reached');
    });
  });
});
