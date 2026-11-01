/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { MarketplaceEntry, MarketplaceView } from '../../shared/chrome-api.ts';
import { Extensions } from './Extensions.tsx';

const ENTRY: MarketplaceEntry = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example', url: null },
  homepage: 'https://example.org',
  review: 'reviewed',
  version: '1.1.0',
  capabilities: ['composer:insert-draft', 'unknown:capability'],
  hosts: ['api.example.org'],
  notes: null,
  installed: null,
  action: 'install',
};

function setup(marketplace: () => Promise<MarketplaceView>, install = () => Promise.resolve()) {
  const extensions = {
    list: vi.fn(() => Promise.resolve({ extensions: [], developerMode: false, activity: [] })),
    marketplace: vi.fn(marketplace),
    installListed: vi.fn(install),
    onChange: vi.fn(),
  };
  render(<Extensions api={fakeChromeApi({ extensions })} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
  return extensions;
}

const ready = (extensions: MarketplaceEntry[]) => () =>
  Promise.resolve<MarketplaceView>({ status: 'ready', extensions });

afterEach(() => {
  cleanup();
});

describe('the Extensions window’s tabs', () => {
  it('switches between the installed extensions and the marketplace, by click or arrow key', async () => {
    const extensions = setup(ready([]));
    const marketplace = screen.getByRole('tab', { name: 'Marketplace' });
    expect(marketplace.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-marketplace');
    await screen.findByText('No extensions match.');
    fireEvent.keyDown(marketplace, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Installed' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.activeElement?.id).toBe('tab-installed');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Installed' }), { key: 'ArrowRight' });
    expect(marketplace.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(marketplace, { key: 'Enter' });
    expect(marketplace.getAttribute('aria-selected')).toBe('true');
    expect(extensions.marketplace).toHaveBeenCalledTimes(2);
  });
});

describe('Marketplace', () => {
  it('loads the list only when its tab opens, and shows what each extension asks for', async () => {
    setup(
      ready([
        ENTRY,
        {
          ...ENTRY,
          id: 'org.guita.yapyap.ai',
          name: 'AI',
          review: 'official',
          capabilities: [],
          hosts: [],
          action: 'installed',
        },
      ]),
    );
    expect(screen.getByRole('status').textContent).toBe('Loading the marketplace…');
    await screen.findByRole('heading', { name: 'Hello' });
    expect(screen.getByText('Reviewed by YapYap')).toBeTruthy();
    expect(screen.getByText('By YapYap')).toBeTruthy();
    expect(screen.getAllByText('By Example')).toHaveLength(2);
    expect(screen.getAllByText('Version 1.1.0')).toHaveLength(2);
    expect(
      screen.getByText('Write drafts in the message box, which you send yourself'),
    ).toBeTruthy();
    expect(screen.getByText('unknown:capability')).toBeTruthy();
    expect(screen.getByText('api.example.org')).toBeTruthy();
    expect(screen.getByText('Installed', { selector: '.hint' })).toBeTruthy();
  });

  it('searches by name, summary and author', async () => {
    setup(
      ready([
        ENTRY,
        {
          ...ENTRY,
          id: 'org.example.other',
          name: 'Other',
          summary: 'Translates.',
          author: { name: 'Someone', url: null },
        },
      ]),
    );
    const search = await screen.findByRole('searchbox', { name: 'Search extensions' });
    fireEvent.input(search, { target: { value: ' TRANSL ' } });
    expect(screen.queryByRole('heading', { name: 'Hello' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Other' })).toBeTruthy();
    fireEvent.input(search, { target: { value: 'example' } });
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy();
    fireEvent.input(search, { target: { value: 'nothing like it' } });
    expect(screen.getByText('No extensions match.')).toBeTruthy();
  });

  it('installs or updates by ID, then loads the list again', async () => {
    let finish = (): void => undefined;
    const extensions = setup(
      ready([
        ENTRY,
        {
          ...ENTRY,
          id: 'org.example.old',
          name: 'Old',
          installed: '1.0.0',
          action: 'update',
          notes: 'Faster greetings.',
        },
        { ...ENTRY, id: 'org.example.new', name: 'New', action: 'incompatible', notes: 'Unseen.' },
      ]),
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const install = await screen.findByRole('button', { name: 'Install Hello' });
    expect(screen.getByRole('button', { name: 'Update Old to 1.1.0' }).textContent).toBe(
      'Update to 1.1.0',
    );
    expect(screen.getByText('Needs a newer YapYap')).toBeTruthy();
    // Notes show for an update only: they say what the update brings.
    expect(screen.getByText('What’s new in 1.1.0')).toBeTruthy();
    expect(screen.getByText('Faster greetings.')).toBeTruthy();
    expect(screen.queryByText('Unseen.')).toBeNull();
    fireEvent.click(install);
    expect(extensions.installListed).toHaveBeenCalledWith('org.example.hello');
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Install Hello' }).disabled,
      ).toBe(true);
    });
    finish();
    await waitFor(() => {
      expect(extensions.marketplace).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps going when an install fails', async () => {
    const extensions = setup(ready([ENTRY]), () => Promise.reject(new Error('gone')));
    fireEvent.click(await screen.findByRole('button', { name: 'Install Hello' }));
    await waitFor(() => {
      expect(extensions.marketplace).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ['unreachable', 'The marketplace could not be reached. Check your connection and try again.'],
    [
      'invalid',
      'The marketplace sent a list YapYap could not verify, so nothing is shown. Try again later.',
    ],
    ['outdated', 'The marketplace list is out of date, so nothing is shown. Try again later.'],
  ] as const)('says when the list is %s, and tries again on request', async (status, message) => {
    const extensions = setup(() => Promise.resolve({ status, extensions: [] }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(extensions.marketplace).toHaveBeenCalledTimes(2);
  });

  it('treats a failed request as an unreachable marketplace', async () => {
    setup(() => Promise.reject(new Error('offline')));
    expect((await screen.findByRole('alert')).textContent).toContain('could not be reached');
  });
});
