/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEscapeToClose } from './escape.ts';

function Host(props: { readonly dirty?: boolean; readonly close?: () => void }) {
  const { asking, settle } = useEscapeToClose(props);
  return asking ? (
    <div>
      <button
        type="button"
        onClick={() => {
          settle(false);
        }}
      >
        Keep
      </button>
      <button
        type="button"
        onClick={() => {
          settle(true);
        }}
      >
        Discard
      </button>
    </div>
  ) : (
    <p>Editing</p>
  );
}

const press = (key: string) => {
  fireEvent.keyDown(document.body, { key });
};

describe('useEscapeToClose', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('closes the window on Escape and on no other key', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    function Plain() {
      useEscapeToClose();
      return null;
    }
    render(<Plain />);
    press('Enter');
    expect(close).not.toHaveBeenCalled();
    press('Escape');
    expect(close).toHaveBeenCalledOnce();
    cleanup();
    // Gone with the page, it no longer listens.
    press('Escape');
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the window its own way when given one', () => {
    const windowClose = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const close = vi.fn();
    render(<Host close={close} />);
    press('Escape');
    expect(close).toHaveBeenCalledOnce();
    expect(windowClose).not.toHaveBeenCalled();
  });

  it('asks first while dirty, then keeps editing or closes as the user answers', () => {
    const close = vi.fn();
    const { rerender } = render(<Host close={close} dirty />);
    press('Escape');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByText('Editing')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    press('Escape');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(close).toHaveBeenCalledOnce();
    // The latest answer counts, without registering the key again.
    rerender(<Host close={close} dirty={false} />);
    press('Escape');
    expect(close).toHaveBeenCalledTimes(2);
  });
});
