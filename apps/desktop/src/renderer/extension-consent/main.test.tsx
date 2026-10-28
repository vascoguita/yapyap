/** @vitest-environment happy-dom */
import { waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

describe('extension consent entry', () => {
  it('renders the consent page', async () => {
    const consent = {
      id: 'org.example.hello',
      name: 'Hello',
      version: '1.0.0',
      author: { name: 'Example', url: null },
      fingerprint: null,
      trust: 'first-party',
      update: false,
      capabilities: [],
      hosts: [],
      added: { capabilities: [], hosts: [] },
    };
    Object.defineProperty(window, 'yapyap', {
      value: { extensions: { consent: vi.fn(() => Promise.resolve(consent)) } },
    });
    await import('./main.tsx');
    await waitFor(() => {
      expect(document.body.querySelector('h1')?.textContent).toBe('Install Hello?');
    });
  });
});
