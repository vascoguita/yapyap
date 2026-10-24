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
        activity: [],
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
    setup(() => Promise.resolve({ plugins: [], developerMode: true, activity: [] }));
    await screen.findByText('No plugins are installed.');
    expect(screen.getByRole('alert').textContent).toMatch(/Developer Mode is on/);
    expect(screen.getByText('No plugin has asked for anything yet.')).toBeTruthy();
  });

  it('shows what each plugin asked for, newest first, and how it went', async () => {
    const time = '2026-10-24T10:00:00.000Z';
    setup(() =>
      Promise.resolve({
        plugins: [{ id: 'org.example.hello', version: '1.0.0', trust: 'third-party' }],
        developerMode: false,
        activity: [
          {
            time,
            plugin: 'org.example.hello',
            capability: 'secrets:own',
            method: 'secrets.get',
            outcome: 'not-granted',
          },
          {
            time,
            plugin: 'org.example.hello',
            capability: 'notifications:show',
            method: 'notifications.show',
            outcome: 'ok',
          },
          {
            time,
            plugin: 'org.example.hello',
            capability: 'network:api.example.org',
            method: 'network.fetch',
            outcome: 'rate-limited',
          },
        ],
      }),
    );
    const section = await screen.findByRole('region', { name: 'Recent activity' });
    const rows = [...section.querySelectorAll('li')].map((row) => row.textContent);
    const when = new Date(time).toLocaleString();
    expect(rows).toEqual([
      `${when}org.example.helloKeep its own secrets, such as API keys, encryptedRefused: not allowed`,
      `${when}org.example.helloShow notificationsDone`,
      `${when}org.example.hellonetwork:api.example.orgRefused: too many requests`,
    ]);
    expect(screen.getByText('Done').className).toBe('outcome outcome-ok');
  });

  it('shows nothing when the list cannot be read', async () => {
    setup(() => Promise.reject(new Error('unreadable')));
    await Promise.resolve();
    expect(document.body.textContent).toBe('');
  });
});
