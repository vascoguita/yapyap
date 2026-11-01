/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { RecordPromptState } from '../../shared/chrome-api.ts';
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
  render(<RecordPrompt api={fakeChromeApi({ recordPrompt })} />);
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

const ASKING: RecordPromptState = {
  extension: 'Recorder',
  phase: 'asking',
  since: null,
  consent: false,
};

const record = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Record' });

describe('RecordPrompt', () => {
  it('says which extension asks, and records only on Record', async () => {
    const t = setup(() => Promise.resolve(ASKING));
    await screen.findByText('Recorder wants to record this call.');
    expect(screen.getByText('Ask everyone on the call before you record it.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(t.recordPrompt.answer).toHaveBeenLastCalledWith(false, false);
    fireEvent.click(record());
    expect(t.recordPrompt.answer).toHaveBeenLastCalledWith(true, false);
  });

  it('offers Record only once the consent warning is ticked, until then', async () => {
    const t = setup(() => Promise.resolve({ ...ASKING, consent: true }));
    await screen.findByRole('heading', { name: 'Before you record calls' });
    expect(screen.getByText(/against the law to record a call/)).toBeTruthy();
    const box = screen.getByLabelText<HTMLInputElement>(/I will ask for it/);
    expect(box.checked).toBe(false);
    expect(record().disabled).toBe(true);
    fireEvent.click(box);
    expect(record().disabled).toBe(false);
    fireEvent.click(record());
    expect(t.recordPrompt.answer).toHaveBeenLastCalledWith(true, true);
    fireEvent.click(box);
    expect(record().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(t.recordPrompt.answer).toHaveBeenLastCalledWith(false, false);
  });

  it('shows the recording with its time and a way to stop it, then that it is saved', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-27T14:06:05.000Z'));
    const t = setup(() => Promise.resolve(ASKING));
    await waitFor(() => {
      expect(t.recordPrompt.onState).toHaveBeenCalled();
    });
    t.push({ ...ASKING, phase: 'recording', since: '2026-10-27T14:05:00.000Z' });
    expect(screen.getByRole('status').textContent).toBe('Recording 1:05');
    void act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('status').textContent).toBe('Recording 1:07');
    fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' }));
    expect(t.recordPrompt.stop).toHaveBeenCalledOnce();
    t.push({ ...ASKING, phase: 'ended', since: '2026-10-27T14:05:00.000Z' });
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
