import { describe, expect, it, vi } from 'vitest';
import { chatListWidths, isChatListWidth } from './widths.ts';

const PERSONAL = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const WORK = '7d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6';

function file(text?: string) {
  return {
    read: vi.fn((): string => {
      if (text === undefined) {
        throw new Error('ENOENT');
      }
      return text;
    }),
    write: vi.fn(),
  };
}

const saved = (widths: Record<string, number>): string =>
  `${JSON.stringify({ version: 1, widths })}\n`;

describe('isChatListWidth', () => {
  it.each([240, 320, 4800])('accepts %j', (width) => {
    expect(isChatListWidth(width)).toBe(true);
  });

  it.each([239, 4801, 320.5, '320', null, Number.NaN])('refuses %j', (width) => {
    expect(isChatListWidth(width)).toBe(false);
  });
});

describe('chatListWidths', () => {
  it('reads each account’s width from the file', () => {
    const widths = chatListWidths(file(saved({ [PERSONAL]: 320 })), vi.fn());
    expect(widths.get(PERSONAL)).toBe(320);
    expect(widths.get(WORK)).toBeUndefined();
  });

  it.each([
    ['missing', undefined],
    ['not JSON', '{'],
    ['from another version', JSON.stringify({ version: 2, widths: { [PERSONAL]: 320 } })],
    ['holding a width out of bounds', saved({ [PERSONAL]: 100 })],
    ['naming something other than an account', saved({ name: 320 })],
  ])('starts with none when the file is %s', (_case, text) => {
    expect(chatListWidths(file(text), vi.fn()).get(PERSONAL)).toBeUndefined();
  });

  it('keeps a width per account and writes the file when one changes', () => {
    const store = file();
    const widths = chatListWidths(store, vi.fn());
    widths.set(PERSONAL, 320);
    widths.set(WORK, 400);
    expect(widths.get(PERSONAL)).toBe(320);
    expect(widths.get(WORK)).toBe(400);
    expect(store.write).toHaveBeenLastCalledWith(saved({ [PERSONAL]: 320, [WORK]: 400 }));
    widths.set(PERSONAL, 320);
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it('goes back to WhatsApp’s own width, and forgets a removed account', () => {
    const store = file(saved({ [PERSONAL]: 320, [WORK]: 400 }));
    const widths = chatListWidths(store, vi.fn());
    widths.set(PERSONAL, undefined);
    expect(widths.get(PERSONAL)).toBeUndefined();
    expect(store.write).toHaveBeenLastCalledWith(saved({ [WORK]: 400 }));
    widths.forget(WORK);
    expect(store.write).toHaveBeenLastCalledWith(saved({}));
    widths.forget(WORK);
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it('keeps the width for this run when the file cannot be written', () => {
    const store = file();
    store.write.mockImplementation(() => {
      throw new Error('EACCES');
    });
    const warn = vi.fn();
    const widths = chatListWidths(store, warn);
    widths.set(PERSONAL, 320);
    expect(widths.get(PERSONAL)).toBe(320);
    expect(warn).toHaveBeenCalledExactlyOnceWith('Could not save the chat list width.');
  });
});
