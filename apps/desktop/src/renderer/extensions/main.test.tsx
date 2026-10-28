/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('extensions entry', () => {
  it('renders the Extensions page', async () => {
    Object.defineProperty(window, 'yapyap', {
      value: {
        extensions: {
          list: vi.fn(() =>
            Promise.resolve({ extensions: [], developerMode: false, activity: [] }),
          ),
          onChange: vi.fn(),
        },
      },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Extensions');
    });
  });
});
