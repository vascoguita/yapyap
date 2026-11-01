/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { ExtensionConsent as Consent } from '../../shared/chrome-api.ts';
import { ExtensionConsent } from './ExtensionConsent.tsx';

const CONSENT: Consent = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.0.0',
  author: { name: 'Example Ltd', url: 'https://example.com' },
  fingerprint: 'ab:cd:ef',
  trust: 'third-party',
  source: null,
  update: false,
  capabilities: ['composer:insert-draft', 'custom:unknown'],
  hosts: ['api.example.com'],
  added: { capabilities: [], hosts: [] },
};

function setup(consent: () => Promise<Consent> = () => Promise.resolve(CONSENT)) {
  const extensions = {
    list: vi.fn(),
    consent: vi.fn(consent),
    answer: vi.fn(() => Promise.resolve()),
  };
  render(<ExtensionConsent api={fakeChromeApi({ extensions })} />);
  return { extensions };
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });

afterEach(() => {
  cleanup();
});

describe('ExtensionConsent', () => {
  it('shows who made and signed the extension, and everything it asks for', async () => {
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

  it('keeps Install off for a third-party extension until the user accepts the risk', async () => {
    const t = setup();
    await screen.findByText(/you install it at your own risk/);
    expect(button('Install').disabled).toBe(true);
    fireEvent.click(
      screen.getByLabelText('I understand that I install this extension at my own risk'),
    );
    expect(button('Install').disabled).toBe(false);
    fireEvent.click(button('Install'));
    expect(t.extensions.answer).toHaveBeenCalledWith(true, true);
  });

  it('warns more strongly about an unsigned extension', async () => {
    setup(() =>
      Promise.resolve({
        ...CONSENT,
        trust: 'developer',
        fingerprint: null,
        author: { name: 'Me', url: null },
      }),
    );
    await screen.findByText(/Nobody signed this extension/);
    expect(screen.getByText('Not signed')).toBeTruthy();
    expect(screen.queryByText('https://example.com')).toBeNull();
  });

  it('needs no acknowledgement for an extension signed by YapYap', async () => {
    const t = setup(() => Promise.resolve({ ...CONSENT, trust: 'first-party' }));
    await screen.findByText('Signed by YapYap.');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(button('Install'));
    expect(t.extensions.answer).toHaveBeenCalledWith(true, false);
  });

  it('names the author’s host of a marketplace extension nobody reviewed, and needs the acknowledgement', async () => {
    const t = setup(() => Promise.resolve({ ...CONSENT, source: 'downloads.example.org' }));
    await screen.findByText(
      /^Third-party, not reviewed: .* It downloads from downloads\.example\.org, its author’s server, which sees your IP address\./,
    );
    expect(screen.getByText('ab:cd:ef')).toBeTruthy();
    expect(button('Install').disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button('Install'));
    expect(t.extensions.answer).toHaveBeenCalledWith(true, true);
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
    expect(t.extensions.answer).toHaveBeenCalledWith(false, false);
    expect(button('Update').disabled).toBe(true);
  });

  it('lists no hosts for an extension that connects nowhere', async () => {
    setup(() => Promise.resolve({ ...CONSENT, hosts: [] }));
    await screen.findByText('It asks to:');
    expect(screen.queryByText('Connect to:')).toBeNull();
  });

  it('says when the extension asks for nothing', async () => {
    setup(() => Promise.resolve({ ...CONSENT, capabilities: [], hosts: [] }));
    expect(await screen.findByText('It asks for nothing.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows nothing when there is no install to ask about', async () => {
    setup(() => Promise.reject(new Error('No extension install belongs to this window.')));
    await Promise.resolve();
    expect(document.body.textContent).toBe('');
  });
});
