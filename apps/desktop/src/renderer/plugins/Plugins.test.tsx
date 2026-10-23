/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, PluginList } from '../../shared/chrome-api.ts';
import { Plugins } from './Plugins.tsx';

function setup(list: () => Promise<PluginList>) {
  const plugins = { list: vi.fn(list), consent: vi.fn(), answer: vi.fn() };
  render(<Plugins api={{ plugins } as unknown as ChromeApi} />);
}

afterEach(() => {
  cleanup();
});

describe('Plugins', () => {
  it('marks each plugin by who vouches for it', async () => {
    setup(() =>
      Promise.resolve({
        plugins: [
          { id: 'org.example.hello', version: '1.0.0', trust: 'third-party' },
          { id: 'org.guita.yapyap.ai', version: '2.0.0', trust: 'first-party' },
          { id: 'org.me.draft', version: '0.1.0', trust: 'developer' },
        ],
        developerMode: false,
      }),
    );
    await screen.findByText('org.example.hello');
    expect(screen.getByText('Third-party').className).toBe('trust trust-third-party');
    expect(screen.getByText('By YapYap')).toBeTruthy();
    expect(screen.getByText('Unsigned')).toBeTruthy();
    expect(screen.getByText('Version 2.0.0')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when nothing is installed, and warns while Developer Mode is on', async () => {
    setup(() => Promise.resolve({ plugins: [], developerMode: true }));
    await screen.findByText('No plugins are installed.');
    expect(screen.getByRole('alert').textContent).toMatch(/Developer Mode is on/);
  });

  it('shows nothing when the list cannot be read', async () => {
    setup(() => Promise.reject(new Error('unreadable')));
    await Promise.resolve();
    expect(document.body.textContent).toBe('');
  });
});
