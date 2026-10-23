import { describe, expect, it, vi } from 'vitest';
import { focusPageWithWindow } from './focus-page.ts';

describe('focusPageWithWindow', () => {
  it('focuses the page whenever the window gains focus', () => {
    let focused: (() => void) | undefined;
    const window = {
      on: vi.fn((_event: 'focus', listener: () => void) => {
        focused = listener;
      }),
    };
    const page = { focus: vi.fn() };
    focusPageWithWindow(window, page);
    expect(page.focus).not.toHaveBeenCalled();
    focused?.();
    expect(page.focus).toHaveBeenCalledOnce();
  });
});
