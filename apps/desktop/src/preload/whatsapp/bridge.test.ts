import { describe, expect, it, vi } from 'vitest';
import {
  createAssistantBarBridge,
  createChatListBridge,
  createNotificationBridge,
  createShareBridge,
} from './bridge.ts';

describe('createNotificationBridge', () => {
  it('sends each operation on its own fixed channel', () => {
    const ipc = { send: vi.fn(), on: vi.fn() };
    const bridge = createNotificationBridge(ipc);
    const request = { id: '1', title: 'Alice', body: 'Hi', tag: '', silent: false, icon: '' };
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

describe('createShareBridge', () => {
  it('reports shares on fixed channels, and passes on stop requests by ID only', () => {
    let deliver: ((event: unknown, ...args: unknown[]) => void) | undefined;
    const ipc = {
      send: vi.fn(),
      on: vi.fn((_channel: string, listener: typeof deliver) => {
        deliver = listener;
      }),
    };
    const bridge = createShareBridge(ipc);
    bridge.started('1');
    bridge.ended('1');
    expect(ipc.send.mock.calls).toEqual([
      ['whatsapp:share-started', '1'],
      ['whatsapp:share-ended', '1'],
    ]);
    const listener = vi.fn();
    bridge.onStop(listener);
    expect(ipc.on).toHaveBeenCalledWith('whatsapp:share-stop', expect.any(Function));
    deliver?.({}, '1');
    deliver?.({}, 1);
    expect(listener.mock.calls).toEqual([['1']]);
  });
});

describe('createAssistantBarBridge', () => {
  it('sends each of the assistant’s actions on its own fixed channel', () => {
    const ipc = { send: vi.fn() };
    const bridge = createAssistantBarBridge(ipc);
    bridge.polish('soften');
    bridge.use(1);
    bridge.dismiss();
    bridge.button('undo');
    bridge.settings();
    expect(ipc.send.mock.calls).toEqual([
      ['whatsapp:assistant-bar-polish', 'soften'],
      ['whatsapp:assistant-bar-use', 1],
      ['whatsapp:assistant-bar-dismiss'],
      ['whatsapp:assistant-bar-button', 'undo'],
      ['whatsapp:assistant-bar-settings'],
    ]);
  });
});

describe('createChatListBridge', () => {
  it('sends the divider’s two actions on their own fixed channels', () => {
    const ipc = { send: vi.fn() };
    const bridge = createChatListBridge(ipc);
    bridge.resize(320);
    bridge.reset();
    expect(ipc.send.mock.calls).toEqual([
      ['whatsapp:chat-list-resize', 320],
      ['whatsapp:chat-list-reset'],
    ]);
    expect(Object.keys(bridge)).toEqual(['resize', 'reset']);
  });
});
