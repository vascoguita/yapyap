import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOW_FALLBACK_MS, showWhenPageReady, showWhenReady } from './show-when-ready.ts';

function emitter() {
  const listeners = new Map<string, () => void>();
  return {
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    fire: (event: string) => {
      listeners.get(event)?.();
    },
  };
}

const showable = () => ({ ...emitter(), show: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('showWhenReady', () => {
  it('shows the window once its page is ready, and not again after the fallback', () => {
    const window = showable();
    showWhenReady(window);
    expect(window.show).not.toHaveBeenCalled();
    window.fire('ready-to-show');
    vi.advanceTimersByTime(SHOW_FALLBACK_MS);
    expect(window.show).toHaveBeenCalledOnce();
  });

  it('shows the window after the fallback when its page never says it is ready', () => {
    const window = showable();
    showWhenReady(window);
    vi.advanceTimersByTime(SHOW_FALLBACK_MS - 1);
    expect(window.show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(window.show).toHaveBeenCalledOnce();
  });
});

describe('showWhenPageReady', () => {
  it.each(['dom-ready', 'did-fail-load'])('shows the window once the page fires %s', (event) => {
    const window = { show: vi.fn() };
    const page = emitter();
    showWhenPageReady(window, false, page);
    page.fire(event);
    page.fire('dom-ready');
    vi.advanceTimersByTime(SHOW_FALLBACK_MS);
    expect(window.show).toHaveBeenCalledOnce();
  });

  it('leaves a window started minimized hidden', () => {
    const window = { show: vi.fn() };
    const page = emitter();
    showWhenPageReady(window, true, page);
    vi.advanceTimersByTime(SHOW_FALLBACK_MS);
    expect(page.once).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
  });
});
