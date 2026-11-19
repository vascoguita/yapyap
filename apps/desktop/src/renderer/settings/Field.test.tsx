/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { Field } from './Field.tsx';

const snapshot = (overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot => ({
  values: {},
  restartPending: false,
  platform: 'linux',
  problems: {},
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('a switch', () => {
  const field = {
    id: 'general.example',
    label: 'Example',
    description: 'Applies at once.',
    restart: false,
  } as const;

  it('is described by its hint alone when it needs no restart, and its label flips it', () => {
    const onChange = vi.fn();
    render(<Field field={field} snapshot={snapshot()} onChange={onChange} />);
    const box = screen.getByRole<HTMLInputElement>('switch', { name: 'Example' });
    expect(box.getAttribute('aria-describedby')).toBe('general.example-hint');
    expect(document.getElementById('general.example-hint')?.textContent).toBe('Applies at once.');
    expect(document.getElementById('general.example-tag')).toBeNull();
    fireEvent.click(screen.getByText('Example'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('general.example', true);
  });

  it('words its hint for macOS where it has a macOS wording', () => {
    const tray = { ...field, description: 'In the tray.', descriptionMac: 'In the menu bar.' };
    render(<Field field={tray} snapshot={snapshot({ platform: 'darwin' })} onChange={vi.fn()} />);
    expect(document.getElementById('general.example-hint')?.textContent).toBe('In the menu bar.');
    cleanup();
    render(<Field field={tray} snapshot={snapshot()} onChange={vi.fn()} />);
    expect(document.getElementById('general.example-hint')?.textContent).toBe('In the tray.');
    cleanup();
    render(<Field field={field} snapshot={snapshot({ platform: 'darwin' })} onChange={vi.fn()} />);
    expect(document.getElementById('general.example-hint')?.textContent).toBe('Applies at once.');
  });

  it('explains under a setting why its change did not take effect', () => {
    render(
      <Field
        field={field}
        snapshot={snapshot({ problems: { 'general.example': 'The system refused.' } })}
        onChange={vi.fn()}
      />,
    );
    expect(document.getElementById('general.example-hint')?.textContent).toBe(
      'Applies at once.The system refused.',
    );
  });
});

describe('a text setting', () => {
  const field = {
    id: 'network.proxyServer' as const,
    label: 'Proxy address',
    description: 'A proxy.',
    restart: false,
    text: { placeholder: 'socks5://127.0.0.1:1080' },
  };

  it('saves on Enter or when focus leaves, trimmed, and only when it changed', () => {
    const onChange = vi.fn();
    render(
      <Field
        field={field}
        snapshot={snapshot({ values: { 'network.proxyServer': '' } })}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Proxy address');
    expect(input.placeholder).toBe('socks5://127.0.0.1:1080');
    fireEvent.keyDown(input, { key: 'a' });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    input.value = ' socks5://10.0.0.2:1080 ';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('network.proxyServer', 'socks5://10.0.0.2:1080');
    input.value = 'http://p:8080';
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith('network.proxyServer', 'http://p:8080');
  });

  it('says Saved once saved, until it is typed in again or refused', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Field field={field} snapshot={snapshot()} onChange={onChange} />);
    const input = screen.getByLabelText<HTMLInputElement>('Proxy address');
    expect(input.value).toBe('');
    expect(screen.queryByText('Saved')).toBeNull();
    input.value = 'http://p:8080';
    fireEvent.blur(input);
    expect(screen.getByText('Saved')).toBeTruthy();
    fireEvent.input(input);
    expect(screen.queryByText('Saved')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Saved')).toBeTruthy();
    rerender(
      <Field
        field={field}
        snapshot={snapshot({ problems: { 'network.proxyServer': 'Not an address.' } })}
        onChange={onChange}
      />,
    );
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByText('Not an address.')).toBeTruthy();
  });
});

describe('a folder setting', () => {
  const field = {
    id: 'downloads.folder' as const,
    label: 'Save files to',
    description: 'Where files go.',
    restart: false,
    folder: { defaultName: 'Your Downloads folder', useDefault: 'Use Downloads Folder' },
  };

  it('shows the Downloads folder until another is chosen, and goes back to it', () => {
    const onChange = vi.fn();
    const onChooseFolder = vi.fn();
    const { rerender } = render(
      <Field
        field={field}
        snapshot={snapshot()}
        onChange={onChange}
        onChooseFolder={onChooseFolder}
      />,
    );
    expect(screen.getByText('Your Downloads folder').classList.contains('chosen')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Use Downloads Folder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change… Save files to' }));
    expect(onChooseFolder).toHaveBeenCalledExactlyOnceWith('downloads.folder');
    rerender(
      <Field
        field={field}
        snapshot={snapshot({ values: { 'downloads.folder': '/home/someone/Saved' } })}
        onChange={onChange}
        onChooseFolder={onChooseFolder}
      />,
    );
    expect(screen.getByText('/home/someone/Saved').classList.contains('chosen')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Use Downloads Folder' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('downloads.folder', '');
  });

  it('keeps a long path’s start and end, and the whole of it in its tooltip', () => {
    const path = '/home/someone/Documents/Projects/2026/Family photos/Summer';
    render(
      <Field
        field={field}
        snapshot={snapshot({ values: { 'downloads.folder': path } })}
        onChange={vi.fn()}
      />,
    );
    const shown = screen.getByTitle(path);
    expect(shown.textContent).toBe('/home/someone/D…y photos/Summer');
  });

  it('chooses nothing where no folder dialog is offered', () => {
    render(<Field field={field} snapshot={snapshot()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change… Save files to' }));
    expect(screen.getByText('Your Downloads folder')).toBeTruthy();
  });
});
