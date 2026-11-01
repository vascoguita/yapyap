/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscardPrompt } from './discard.tsx';

afterEach(() => {
  cleanup();
});

describe('DiscardPrompt', () => {
  it('takes the focus on Keep Editing, and keeps editing on Escape before the page hears it', () => {
    const onSettle = vi.fn();
    const page = vi.fn();
    document.addEventListener('keydown', page);
    render(<DiscardPrompt message="Discard your changes?" onSettle={onSettle} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(screen.getByRole('alertdialog').getAttribute('aria-describedby')).toBe(
      'discard-message',
    );
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onSettle).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onSettle).toHaveBeenCalledExactlyOnceWith(false);
    expect(page).toHaveBeenCalledOnce();
    cleanup();
    // Gone, it no longer catches Escape.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onSettle).toHaveBeenCalledOnce();
    expect(page).toHaveBeenCalledTimes(2);
    document.removeEventListener('keydown', page);
  });
});
