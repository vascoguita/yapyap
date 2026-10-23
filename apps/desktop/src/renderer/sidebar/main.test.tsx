/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('sidebar entry', () => {
  it('renders the account sidebar', async () => {
    const state = {
      accounts: [{ id: 'a', name: 'Work', color: 'blue', unread: 0, muted: false, active: true }],
      compact: false,
      doNotDisturb: false,
    };
    Object.defineProperty(window, 'yapyap', {
      value: { sidebar: { onState: vi.fn(), state: vi.fn(() => Promise.resolve(state)) } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('nav')?.getAttribute('aria-label')).toBe('Accounts');
    });
  });
});
