/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, RecordPromptState } from '../../shared/chrome-api.ts';
import { elapsed, RecordPrompt } from './RecordPrompt.tsx';

function setup(first: () => Promise<RecordPromptState>) {
  let push: (state: RecordPromptState) => void = () => undefined;
  const recordPrompt = {
    state: vi.fn(first),
    answer: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    onState: vi.fn((listener: (state: RecordPromptState) => void) => {
      push = listener;
    }),
  };
  render(<RecordPrompt api={{ recordPrompt } as unknown as ChromeApi} />);
  return {
    recordPrompt,
    push: (state: RecordPromptState) => {
      void act(() => {
        push(state);
      });
    },
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ASKING: RecordPromptState = { extension: 'Recorder', phase: 'asking', since: null };

describe('RecordPrompt', () => {
  it('says which extension asks, and records only on Record', async () => {
    const t = setup(() => Promise.resolve(ASKING));
    await screen.findByText('Recorder wants to record this call.');
    expect(screen.getByText('Ask everyone on the call before you record it.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(t.recordPrompt.answer).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(t.recordPrompt.answer).toHaveBeenLastCalledWith(true);
  });

  it('shows the recording with its time and a way to stop it, then that it is saved', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-27T14:06:05.000Z'));
    const t = setup(() => Promise.resolve(ASKING));
    await waitFor(() => {
      expect(t.recordPrompt.onState).toHaveBeenCalled();
    });
    t.push({ extension: 'Recorder', phase: 'recording', since: '2026-10-27T14:05:00.000Z' });
    expect(screen.getByRole('status').textContent).toBe('Recording 1:05');
    void act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('status').textContent).toBe('Recording 1:07');
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(t.recordPrompt.stop).toHaveBeenCalledOnce();
    t.push({ extension: 'Recorder', phase: 'ended', since: '2026-10-27T14:05:00.000Z' });
    expect(screen.getByRole('status').textContent).toBe('The recording is saved.');
  });

  it('shows nothing until it knows the state, or when it cannot', async () => {
    setup(() => Promise.reject(new Error('gone')));
    await Promise.resolve();
    expect(document.body.textContent).toBe('');
  });
});

describe('elapsed', () => {
  it.each([
    ['2026-10-27T14:05:00.000Z', '2026-10-27T14:05:09.000Z', '0:09'],
    ['2026-10-27T14:05:00.000Z', '2026-10-27T14:17:30.000Z', '12:30'],
    ['2026-10-27T12:05:00.000Z', '2026-10-27T14:07:03.000Z', '2:02:03'],
    ['2026-10-27T14:05:00.000Z', '2026-10-27T14:04:00.000Z', '0:00'],
  ])('shows the time from %s to %s as %s', (since, now, shown) => {
    expect(elapsed(since, Date.parse(now))).toBe(shown);
  });
});
