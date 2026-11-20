/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DictionaryState } from '../../shared/api/chrome-api.ts';
import { DOWNLOADED_MS, MIN_DOWNLOADING_MS, useShownDictionaries } from './dictionary-states.ts';

function Shown(props: { readonly states: Record<string, DictionaryState> }) {
  return <p>{JSON.stringify(useShownDictionaries(props.states))}</p>;
}

const shown = (): unknown => JSON.parse(screen.getByRole('paragraph').textContent);

describe('useShownDictionaries', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps a quick download in view for a while, then says Downloaded, then nothing', async () => {
    vi.useFakeTimers();
    const { rerender } = render(<Shown states={{ sv: 'downloading', da: 'ready' }} />);
    expect(shown()).toEqual({ sv: 'downloading' });
    rerender(<Shown states={{ sv: 'ready', da: 'ready' }} />);
    expect(shown()).toEqual({ sv: 'downloading' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MIN_DOWNLOADING_MS);
    });
    expect(shown()).toEqual({ sv: 'downloaded' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOADED_MS);
    });
    expect(shown()).toEqual({});
  });

  it('shows a failure until it is tried again, and starts afresh then', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Shown states={{ sv: 'downloading' }} />);
    rerender(<Shown states={{ sv: 'failed' }} />);
    expect(shown()).toEqual({ sv: 'failed' });
    rerender(<Shown states={{ sv: 'ready' }} />);
    expect(shown()).toEqual({});
  });
});
