import { describe, expect, it, vi } from 'vitest';
import extension from './main.ts';

describe('the call recorder', () => {
  it('serves its commands and panel once YapYap activates it', () => {
    const onRun = vi.fn();
    const calls = {};
    extension.activate({ commands: { onRun }, calls } as never);
    expect(onRun.mock.calls.map(([id]: unknown[]) => id)).toEqual(['record', 'stop']);
  });
});
