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
  it('keeps the private model the user chose across restarts', () => {
    const saved = file('');
    const state = assistantState(saved, vi.fn());
    expect(state.privateModel()).toBeUndefined();
    state.setPrivateModel({ id: 'qwen', ready: true });
    const again = assistantState(saved, vi.fn());
    expect(again.privateModel()).toEqual({ id: 'qwen', ready: true });
    again.setPrivateModel(undefined);
    expect(JSON.parse(saved.text)).toEqual({ version: 1, privateModel: null });
  });

  it('starts empty from a damaged file, and says when it cannot save', () => {
    const damaged = file(JSON.stringify({ version: 1, privateModel: { id: 1 } }));
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
    state.setPrivateModel({ id: 'qwen', ready: false });
    expect(state.privateModel()).toEqual({ id: 'qwen', ready: false });
    expect(warn).toHaveBeenCalledWith('Could not save the assistant’s state.');
  });
});
