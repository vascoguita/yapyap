/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('call recording window entry', () => {
  it('renders the prompt', async () => {
    const state = vi.fn(() =>
      Promise.resolve({ extension: 'Recorder', phase: 'asking', since: null }),
    );
    Object.defineProperty(window, 'yapyap', {
      value: { recordPrompt: { state, onState: vi.fn() } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Call recording');
    });
  });
});
