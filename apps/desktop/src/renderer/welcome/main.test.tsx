/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('welcome entry', () => {
  it('renders the welcome page', async () => {
    const snapshot = { values: {}, restartPending: false, readOnly: false, problems: {} };
    Object.defineProperty(window, 'yapyap', {
      value: { settings: { get: vi.fn(() => Promise.resolve(snapshot)) } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Welcome to YapYap');
    });
  });
});
