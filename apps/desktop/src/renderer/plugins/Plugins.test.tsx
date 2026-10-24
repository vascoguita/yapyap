/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, PluginList } from '../../shared/chrome-api.ts';
import { Plugins } from './Plugins.tsx';

function setup(list: () => Promise<PluginList>) {
  const plugins = {
    list: vi.fn(list),
    consent: vi.fn(),
    answer: vi.fn(),
    setGrant: vi.fn(list),
    setSetting: vi.fn(list),
  };
  render(<Plugins api={{ plugins } as unknown as ChromeApi} />);
  return plugins;
}

afterEach(() => {
  cleanup();
});

describe('Plugins', () => {
  it('marks each plugin by who vouches for it', async () => {
    setup(() =>
      Promise.resolve({
        plugins: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            settings: [],
            grants: [],
          },
          {
            id: 'org.guita.yapyap.ai',
            version: '2.0.0',
            trust: 'first-party',
            settings: [],
            grants: [],
          },
          { id: 'org.me.draft', version: '0.1.0', trust: 'developer', settings: [], grants: [] },
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
        plugins: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            settings: [],
            grants: [],
          },
        ],
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
      `${when}org.example.helloConnect to api.example.orgRefused: too many requests`,
    ]);
    expect(screen.getByText('Done').className).toBe('outcome outcome-ok');
  });

  it('shows nothing when the list cannot be read', async () => {
    setup(() => Promise.reject(new Error('unreadable')));
    await Promise.resolve();
    expect(document.body.textContent).toBe('');
  });

  it('lets the user turn each permission off, for the plugin or account by account', async () => {
    const plugins = setup(() =>
      Promise.resolve({
        plugins: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            settings: [],
            grants: [
              {
                capability: 'composer:insert-draft',
                granted: true,
                accounts: [
                  { id: 'a', name: 'Home', granted: true },
                  { id: 'b', name: 'Work', granted: false },
                ],
              },
              { capability: 'notifications:show', granted: true },
              { capability: 'network:api.example.org', granted: false },
              { capability: 'calendar:read', granted: true },
            ],
          },
        ],
        developerMode: false,
        activity: [],
      }),
    );
    fireEvent.click(await screen.findByText('Permissions'));
    const group = screen.getByRole('group', {
      name: 'Write drafts in the message box, which you send yourself',
    });
    expect(group.textContent).toBe(
      'Write drafts in the message box, which you send yourselfHomeWork',
    );
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Home' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Work' }).checked).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Connect to api.example.org' })
        .checked,
    ).toBe(false);
    // A capability this version does not know is shown by its name.
    expect(screen.getByRole('checkbox', { name: 'calendar:read' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Home' }));
    expect(plugins.setGrant).toHaveBeenLastCalledWith(
      'org.example.hello',
      'composer:insert-draft',
      'a',
      false,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show notifications' }));
    expect(plugins.setGrant).toHaveBeenLastCalledWith(
      'org.example.hello',
      'notifications:show',
      null,
      false,
    );
    await waitFor(() => {
      expect(plugins.list).toHaveBeenCalledOnce();
    });
  });

  it('shows no permissions for a plugin that asked for none', async () => {
    setup(() =>
      Promise.resolve({
        plugins: [
          {
            id: 'org.example.quiet',
            version: '1.0.0',
            trust: 'third-party',
            settings: [],
            grants: [],
          },
        ],
        developerMode: false,
        activity: [],
      }),
    );
    await screen.findByText('org.example.quiet');
    expect(screen.queryByText('Permissions')).toBeNull();
  });

  it('keeps the list as it was when a change cannot be saved', async () => {
    const plugins = setup(() =>
      Promise.resolve({
        plugins: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            settings: [],
            grants: [{ capability: 'secrets:own', granted: true }],
          },
        ],
        developerMode: false,
        activity: [],
      }),
    );
    plugins.setGrant.mockRejectedValueOnce(new Error('unwritable'));
    fireEvent.click(await screen.findByText('Permissions'));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Keep its own secrets, such as API keys, encrypted' }),
    );
    expect(plugins.setGrant).toHaveBeenCalledOnce();
    expect(screen.getByText('org.example.hello')).toBeTruthy();
  });

  it('shows a plugin’s settings form, and saves each field as the user changes it', async () => {
    const plugins = setup(() =>
      Promise.resolve({
        plugins: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            grants: [],
            settings: [
              {
                key: 'model',
                type: 'string',
                title: 'Model',
                enum: ['small', 'large'],
                value: 'large',
              },
              { key: 'endpoint', type: 'string', description: 'Where requests go.' },
              { key: 'replies', type: 'integer', title: 'Replies', value: 2 },
              { key: 'concise', type: 'boolean', title: 'Concise' },
              { key: 'tone', type: 'string', title: 'Tone', enum: ['warm', 'plain'] },
            ],
          },
        ],
        developerMode: false,
        activity: [],
      }),
    );
    fireEvent.click(await screen.findByText('Settings'));
    expect(screen.queryByText('Permissions')).toBeNull();
    const model = screen.getByLabelText<HTMLSelectElement>('Model');
    expect(model.value).toBe('large');
    fireEvent.change(model, { target: { value: 'small' } });
    expect(plugins.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'model', 'small');
    fireEvent.change(model, { target: { value: '' } });
    expect(plugins.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'model', null);
    expect(screen.getByText('Where requests go.')).toBeTruthy();
    fireEvent.blur(screen.getByLabelText('endpoint'), { target: { value: 'https://x.example' } });
    expect(plugins.setSetting).toHaveBeenLastCalledWith(
      'org.example.hello',
      'endpoint',
      'https://x.example',
    );
    const replies = screen.getByLabelText<HTMLInputElement>('Replies');
    expect(replies.value).toBe('2');
    fireEvent.blur(replies, { target: { value: '3' } });
    expect(plugins.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'replies', 3);
    expect(screen.getByLabelText<HTMLSelectElement>('Tone').value).toBe('');
    // A save that fails leaves the form as it was.
    plugins.setSetting.mockRejectedValueOnce(new Error('unwritable'));
    fireEvent.click(screen.getByLabelText('Concise'));
    expect(plugins.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'concise', true);
    await waitFor(() => {
      expect(screen.getByLabelText('Model')).toBeTruthy();
    });
  });
});
