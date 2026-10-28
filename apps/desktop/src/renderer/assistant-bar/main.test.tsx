/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('assistant bar entry', () => {
  it('renders the assistant bar', async () => {
    const state = {
      extension: 'AI assistant',
      status: '',
      suggestions: [],
      confirm: undefined,
      working: false,
    };
    Object.defineProperty(window, 'yapyap', {
      value: { assistantBar: { onState: vi.fn(), state: vi.fn(() => Promise.resolve(state)) } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('section')?.getAttribute('aria-label')).toBe(
        'AI suggestions',
      );
    });
  });
});
