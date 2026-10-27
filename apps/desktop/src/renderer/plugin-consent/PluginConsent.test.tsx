/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, PluginConsent as Consent } from '../../shared/chrome-api.ts';
import { PluginConsent } from './PluginConsent.tsx';

const CONSENT: Consent = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.0.0',
  author: { name: 'Example Ltd', url: 'https://example.com' },
  fingerprint: 'ab:cd:ef',
  trust: 'third-party',
  update: false,
  capabilities: ['composer:insert-draft', 'custom:unknown'],
  hosts: ['api.example.com'],
  added: { capabilities: [], hosts: [] },
};

function setup(consent: () => Promise<Consent> = () => Promise.resolve(CONSENT)) {
  const plugins = {
    list: vi.fn(),
    consent: vi.fn(consent),
    answer: vi.fn(() => Promise.resolve()),
  };
  render(<PluginConsent api={{ plugins } as unknown as ChromeApi} />);
  return { plugins };
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });

afterEach(() => {
  cleanup();
});

describe('PluginConsent', () => {
  it('shows who made and signed the plugin, and everything it asks for', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Install Hello?' });
    expect(screen.getByText('By Example Ltd')).toBeTruthy();
    expect(screen.getByText('https://example.com')).toBeTruthy();
    expect(screen.getByText('ab:cd:ef')).toBeTruthy();
    expect(
      screen.getByText('Write drafts in the message box, which you send yourself'),
    ).toBeTruthy();
    expect(screen.getByText('custom:unknown')).toBeTruthy();
    expect(screen.getByText('api.example.com')).toBeTruthy();
  });

  it('keeps Install off for a third-party plugin until the user accepts the risk', async () => {
    const t = setup();
    await screen.findByText(/you install it at your own risk/);
    expect(button('Install').disabled).toBe(true);
    fireEvent.click(
      screen.getByLabelText('I understand that I install this plugin at my own risk'),
    );
    expect(button('Install').disabled).toBe(false);
    fireEvent.click(button('Install'));
    expect(t.plugins.answer).toHaveBeenCalledWith(true, true);
  });

  it('warns more strongly about an unsigned plugin', async () => {
    setup(() =>
      Promise.resolve({
        ...CONSENT,
        trust: 'developer',
        fingerprint: null,
        author: { name: 'Me', url: null },
      }),
    );
    await screen.findByText(/Nobody signed this plugin/);
    expect(screen.getByText('Not signed')).toBeTruthy();
    expect(screen.queryByText('https://example.com')).toBeNull();
  });

  it('needs no acknowledgement for a plugin signed by YapYap', async () => {
    const t = setup(() => Promise.resolve({ ...CONSENT, trust: 'first-party' }));
    await screen.findByText('Signed by YapYap.');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(button('Install'));
    expect(t.plugins.answer).toHaveBeenCalledWith(true, false);
  });

  it('shows the key of a plugin the marketplace reviewed, and needs no acknowledgement', async () => {
    const t = setup(() => Promise.resolve({ ...CONSENT, trust: 'reviewed' }));
    await screen.findByText(/YapYap reviewed this version for the marketplace/);
    expect(screen.getByText('ab:cd:ef')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(button('Install'));
    expect(t.plugins.answer).toHaveBeenCalledWith(true, false);
  });

  it('marks what an update adds, and can be cancelled', async () => {
    const t = setup(() =>
      Promise.resolve({
        ...CONSENT,
        update: true,
        version: '2.0.0',
        added: { capabilities: ['composer:insert-draft'], hosts: ['api.example.com'] },
      }),
    );
    await screen.findByRole('heading', { name: 'Update Hello to 2.0.0?' });
    expect(screen.getByText('This update asks for more than before:')).toBeTruthy();
    expect(screen.getByText('api.example.com').className).toBe('added');
    expect(screen.getByText('custom:unknown').className).toBe('');
    fireEvent.click(button('Cancel'));
    expect(t.plugins.answer).toHaveBeenCalledWith(false, false);
    expect(button('Update').disabled).toBe(true);
  });

  it('lists no hosts for a plugin that connects nowhere', async () => {
    setup(() => Promise.resolve({ ...CONSENT, hosts: [] }));
    await screen.findByText('It asks to:');
    expect(screen.queryByText('Connect to:')).toBeNull();
  });

  it('says when the plugin asks for nothing', async () => {
    setup(() => Promise.resolve({ ...CONSENT, capabilities: [], hosts: [] }));
    expect(await screen.findByText('It asks for nothing.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows nothing when there is no install to ask about', async () => {
    setup(() => Promise.reject(new Error('No plugin install belongs to this window.')));
    await Promise.resolve();
    expect(document.body.textContent).toBe('');
  });
});
