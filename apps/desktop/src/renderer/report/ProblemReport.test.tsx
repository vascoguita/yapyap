/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import { ProblemReport } from './ProblemReport.tsx';

function setup(open: () => Promise<void> = () => Promise.resolve()) {
  const report = {
    diagnostics: vi.fn(() => Promise.resolve('YapYap 0.1.0 (deb)')),
    open: vi.fn(open),
  };
  render(<ProblemReport api={fakeChromeApi({ report })} />);
  return { report };
}

afterEach(() => {
  cleanup();
});

describe('ProblemReport', () => {
  it('shows every line the report carries before anything is sent', async () => {
    setup();
    expect(await screen.findByDisplayValue('YapYap 0.1.0 (deb)')).toBeTruthy();
    expect(screen.getByLabelText('What the report includes')).toHaveProperty('readOnly', true);
    expect(screen.getByText(/YapYap sends nothing/)).toBeTruthy();
  });

  it('copies the report and opens GitHub with the description', async () => {
    const t = setup();
    fireEvent.input(screen.getByLabelText('What happened?'), {
      target: { value: 'It froze.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy and Open GitHub' }));
    expect(t.report.open).toHaveBeenCalledWith('It froze.');
    expect(await screen.findByText(/on your clipboard/)).toBeTruthy();
  });

  it('closes on Escape unless the description would be lost', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    setup();
    const description = screen.getByLabelText('What happened?');
    fireEvent.input(description, { target: { value: '  ' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    fireEvent.input(description, { target: { value: 'It froze.' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'Discard your description of the problem?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(close).toHaveBeenCalledOnce();
    // Once on the clipboard and in the issue form, closing loses nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Copy and Open GitHub' }));
    await screen.findByText(/on your clipboard/);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(2);
    fireEvent.input(description, { target: { value: 'It froze twice.' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(close).toHaveBeenCalledTimes(3);
    close.mockRestore();
  });

  it('says when GitHub could not be opened', async () => {
    setup(() => Promise.reject(new Error('no browser')));
    fireEvent.click(screen.getByRole('button', { name: 'Copy and Open GitHub' }));
    expect(await screen.findByText(/Could not open GitHub/)).toBeTruthy();
  });

  it('shows the form even when the diagnostics cannot be read', async () => {
    const report = { diagnostics: vi.fn(() => Promise.reject(new Error('gone'))), open: vi.fn() };
    render(<ProblemReport api={fakeChromeApi({ report })} />);
    await vi.waitFor(() => {
      expect(report.diagnostics).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'Copy and Open GitHub' })).toBeTruthy();
  });
});
