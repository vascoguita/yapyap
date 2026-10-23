/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('accounts entry', () => {
  it('renders the Accounts page', async () => {
    Object.defineProperty(window, 'yapyap', {
      value: { accounts: { list: vi.fn(() => new Promise(() => undefined)) } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Accounts');
    });
  });
});
