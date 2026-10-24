/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('quick panel entry', () => {
  it('renders the quick-access panel', async () => {
    const state = { accounts: [], compact: false, doNotDisturb: true };
    Object.defineProperty(window, 'yapyap', {
      value: { sidebar: { onState: vi.fn(), state: vi.fn(() => Promise.resolve(state)) } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector<HTMLInputElement>('input')?.checked).toBe(true);
    });
  });
});
