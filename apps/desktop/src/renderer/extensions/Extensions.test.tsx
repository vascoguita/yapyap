/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, ExtensionList } from '../../shared/chrome-api.ts';
import { Extensions } from './Extensions.tsx';

function setup(list: () => Promise<ExtensionList>) {
  const extensions = {
    list: vi.fn(list),
    consent: vi.fn(),
    answer: vi.fn(),
    setGrant: vi.fn(list),
    setSetting: vi.fn(list),
    remove: vi.fn(list),
    onChange: vi.fn(),
  };
  render(<Extensions api={{ extensions } as unknown as ChromeApi} />);
  return extensions;
}

afterEach(() => {
  cleanup();
});

describe('Extensions', () => {
  it('marks each extension by who vouches for it', async () => {
    setup(() =>
      Promise.resolve({
        extensions: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            pulled: null,
            settings: [],
            grants: [],
          },
          {
            id: 'org.guita.yapyap.ai',
            version: '2.0.0',
            trust: 'first-party',
            pulled: null,
            settings: [],
            grants: [],
          },
          {
            id: 'org.me.draft',
            version: '0.1.0',
            trust: 'developer',
            pulled: null,
            settings: [],
            grants: [],
          },
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
    setup(() => Promise.resolve({ extensions: [], developerMode: true, activity: [] }));
    await screen.findByText('No extensions are installed.');
    expect(screen.getByRole('alert').textContent).toMatch(/Developer Mode is on/);
    expect(screen.getByText('No extension has asked for anything yet.')).toBeTruthy();
  });

  it('shows what each extension asked for, newest first, and how it went', async () => {
    const time = '2026-10-24T10:00:00.000Z';
    setup(() =>
      Promise.resolve({
        extensions: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            pulled: null,
            settings: [],
            grants: [],
          },
        ],
        developerMode: false,
        activity: [
          {
            time,
            extension: 'org.example.hello',
            capability: 'secrets:own',
            method: 'secrets.get',
            outcome: 'not-granted',
          },
          {
            time,
            extension: 'org.example.hello',
            capability: 'notifications:show',
            method: 'notifications.show',
            outcome: 'ok',
          },
          {
            time,
            extension: 'org.example.hello',
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
    expect(screen.getByRole('tabpanel').textContent).toBe('');
  });

  it('lets the user turn each permission off, for the extension or account by account', async () => {
    const extensions = setup(() =>
      Promise.resolve({
        extensions: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            pulled: null,
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
    expect(extensions.setGrant).toHaveBeenLastCalledWith(
      'org.example.hello',
      'composer:insert-draft',
      'a',
      false,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show notifications' }));
    expect(extensions.setGrant).toHaveBeenLastCalledWith(
      'org.example.hello',
      'notifications:show',
      null,
      false,
    );
    await waitFor(() => {
      expect(extensions.list).toHaveBeenCalledOnce();
    });
  });

  it('shows no permissions for an extension that asked for none', async () => {
    setup(() =>
      Promise.resolve({
        extensions: [
          {
            id: 'org.example.quiet',
            version: '1.0.0',
            trust: 'third-party',
            pulled: null,
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

  it('removes an extension, showing the list YapYap answers with', async () => {
    const hello = {
      id: 'org.example.hello',
      version: '1.0.0',
      trust: 'third-party' as const,
      pulled: 'It sent chats away.',
      settings: [],
      grants: [],
    };
    const extensions = setup(() =>
      Promise.resolve({ extensions: [hello], developerMode: false, activity: [] }),
    );
    // A pulled extension stays listed, with the reason, until the user removes it.
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The marketplace pulled this version, so it does not run: It sent chats away. Remove it, or install another version from the Marketplace tab.',
    );
    extensions.remove.mockResolvedValueOnce({ extensions: [], developerMode: false, activity: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove org.example.hello' }));
    expect(extensions.remove).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    await screen.findByText('No extensions are installed.');
    cleanup();
    const again = setup(() =>
      Promise.resolve({ extensions: [hello], developerMode: false, activity: [] }),
    );
    again.remove.mockRejectedValueOnce(new Error('unwritable'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove org.example.hello' }));
    expect(again.remove).toHaveBeenCalledOnce();
    expect(screen.getByText('org.example.hello')).toBeTruthy();
  });

  it('lists the extensions again when YapYap says they changed', async () => {
    let installed = false;
    const extensions = setup(() =>
      Promise.resolve({
        extensions: installed
          ? [
              {
                id: 'org.example.hello',
                version: '1.0.0',
                trust: 'third-party' as const,
                pulled: null,
                settings: [],
                grants: [],
              },
            ]
          : [],
        developerMode: false,
        activity: [],
      }),
    );
    await screen.findByText('No extensions are installed.');
    installed = true;
    const [changed] = extensions.onChange.mock.calls[0] as [() => void];
    changed();
    expect(await screen.findByText('org.example.hello')).toBeTruthy();
    expect(extensions.list).toHaveBeenCalledTimes(2);
  });

  it('keeps the list as it was when a change cannot be saved', async () => {
    const extensions = setup(() =>
      Promise.resolve({
        extensions: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            pulled: null,
            settings: [],
            grants: [{ capability: 'secrets:own', granted: true }],
          },
        ],
        developerMode: false,
        activity: [],
      }),
    );
    extensions.setGrant.mockRejectedValueOnce(new Error('unwritable'));
    fireEvent.click(await screen.findByText('Permissions'));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Keep its own secrets, such as API keys, encrypted' }),
    );
    expect(extensions.setGrant).toHaveBeenCalledOnce();
    expect(screen.getByText('org.example.hello')).toBeTruthy();
  });

  it('shows an extension’s settings form, and saves each field as the user changes it', async () => {
    const extensions = setup(() =>
      Promise.resolve({
        extensions: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            pulled: null,
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
    expect(extensions.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'model', 'small');
    fireEvent.change(model, { target: { value: '' } });
    expect(extensions.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'model', null);
    expect(screen.getByText('Where requests go.')).toBeTruthy();
    const endpoint = screen.getByLabelText('endpoint');
    fireEvent.input(endpoint, { target: { value: 'https://x.example' } });
    fireEvent.change(endpoint);
    expect(extensions.setSetting).toHaveBeenLastCalledWith(
      'org.example.hello',
      'endpoint',
      'https://x.example',
    );
    const replies = screen.getByLabelText<HTMLInputElement>('Replies');
    expect(replies.value).toBe('2');
    fireEvent.input(replies, { target: { value: '3' } });
    fireEvent.change(replies);
    expect(extensions.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'replies', 3);
    expect(screen.getByLabelText<HTMLSelectElement>('Tone').value).toBe('');
    // A save that fails leaves the form as it was.
    extensions.setSetting.mockRejectedValueOnce(new Error('unwritable'));
    fireEvent.click(screen.getByLabelText('Concise'));
    expect(extensions.setSetting).toHaveBeenLastCalledWith('org.example.hello', 'concise', true);
    await waitFor(() => {
      expect(screen.getByLabelText('Model')).toBeTruthy();
    });
  });

  it('saves typed text when the window closes, and says whether it was kept', async () => {
    const extensions = setup(() =>
      Promise.resolve({
        extensions: [
          {
            id: 'org.example.hello',
            version: '1.0.0',
            trust: 'third-party',
            pulled: null,
            grants: [],
            settings: [
              { key: 'endpoint', type: 'string', title: 'Server', value: 'https://a.example' },
            ],
          },
        ],
        developerMode: false,
        activity: [],
      }),
    );
    fireEvent.click(await screen.findByText('Settings'));
    const field = screen.getByLabelText<HTMLInputElement>('Server');
    fireEvent.input(field, { target: { value: 'https://b.example' } });
    // Preact attaches the listener after the next frame, so keep closing until it hears.
    await waitFor(() => {
      globalThis.dispatchEvent(new Event('pagehide'));
      expect(extensions.setSetting).toHaveBeenCalledExactlyOnceWith(
        'org.example.hello',
        'endpoint',
        'https://b.example',
      );
    });
    expect(await screen.findByText('Saved')).toBeTruthy();
    // What YapYap already has is not saved again.
    fireEvent.input(field, { target: { value: 'https://a.example' } });
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(extensions.setSetting).toHaveBeenCalledOnce();
    extensions.setSetting.mockRejectedValueOnce(new Error('refused'));
    fireEvent.input(field, { target: { value: 'not a server' } });
    expect(screen.queryByText('Saved')).toBeNull();
    fireEvent.change(field);
    expect(await screen.findByText('Not saved: YapYap could not use this value')).toBeTruthy();
  });
});
