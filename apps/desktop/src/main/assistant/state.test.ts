import { describe, expect, it, vi } from 'vitest';
import { assistantState } from './state.ts';

const file = (text: string) => {
  const memory = {
    text,
    read: () => memory.text,
    write: vi.fn((next: string) => {
      memory.text = next;
    }),
  };
  return memory;
};

describe('assistantState', () => {
  it('keeps the private model the user chose, and a one-time notice, across restarts', () => {
    const saved = file('');
    const state = assistantState(saved, vi.fn());
    expect(state.privateModel()).toBeUndefined();
    expect(state.notice()).toBeUndefined();
    state.setPrivateModel({ id: 'qwen', ready: true });
    state.setNotice('moved-redownload');
    const again = assistantState(saved, vi.fn());
    expect(again.privateModel()).toEqual({ id: 'qwen', ready: true });
    expect(again.notice()).toBe('moved-redownload');
    again.setPrivateModel(undefined);
    again.setNotice(undefined);
    expect(JSON.parse(saved.text)).toEqual({ version: 1, privateModel: null, notice: null });
  });

  it('starts empty from a damaged file, and says when it cannot save', () => {
    const damaged = file(JSON.stringify({ version: 1, privateModel: { id: 1 }, notice: null }));
    expect(assistantState(damaged, vi.fn()).privateModel()).toBeUndefined();
    const warn = vi.fn();
    const state = assistantState(
      {
        read: () => '{',
        write: () => {
          throw new Error('EACCES');
        },
      },
      warn,
    );
    state.setNotice('moved');
    expect(state.notice()).toBe('moved');
    expect(warn).toHaveBeenCalledWith('Could not save the assistant’s state.');
  });
});
