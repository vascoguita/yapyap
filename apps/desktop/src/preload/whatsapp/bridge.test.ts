import { describe, expect, it, vi } from 'vitest';
import { createNotificationBridge } from './bridge.ts';

describe('createNotificationBridge', () => {
  it('sends each operation on its own fixed channel', () => {
    const ipc = { send: vi.fn(), on: vi.fn() };
    const bridge = createNotificationBridge(ipc);
    const request = { id: '1', title: 'Alice', body: 'Hi', tag: '', silent: false };
    bridge.show(request);
    bridge.close('1');
    expect(ipc.send.mock.calls).toEqual([
      ['whatsapp:notification-show', request],
      ['whatsapp:notification-close', '1'],
    ]);
  });

  it('passes clicks on to the page, ignoring anything but an ID', () => {
    let deliver: ((event: unknown, ...args: unknown[]) => void) | undefined;
    const ipc = {
      send: vi.fn(),
      on: vi.fn((_channel: string, listener: typeof deliver) => {
        deliver = listener;
      }),
    };
    const listener = vi.fn();
    createNotificationBridge(ipc).onClick(listener);
    expect(ipc.on).toHaveBeenCalledWith('whatsapp:notification-click', expect.any(Function));
    deliver?.({}, '7');
    deliver?.({}, { id: '7' });
    expect(listener.mock.calls).toEqual([['7']]);
  });
});
