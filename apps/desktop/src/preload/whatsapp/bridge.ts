import { ASSISTANT_BAR_CHANNELS, type AssistantBarBridge } from '../../shared/assistant-bar-api.ts';
import { CHAT_LIST_CHANNELS, type ChatListBridge } from '../../shared/chat-list-api.ts';
import { NOTIFICATION_CHANNELS, type NotificationBridge } from '../../shared/notification-api.ts';
import { SHARE_CHANNELS, type ShareBridge } from '../../shared/share-api.ts';

export interface PreloadIpc {
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

/**
 * The page's side of WhatsApp notifications: three operations on fixed
 * channels, never `ipcRenderer` itself (ADR 0011).
 */
export function createNotificationBridge(ipc: PreloadIpc): NotificationBridge {
  return {
    show: (request) => {
      ipc.send(NOTIFICATION_CHANNELS.show, request);
    },
    close: (id) => {
      ipc.send(NOTIFICATION_CHANNELS.close, id);
    },
    onClick: (listener) => {
      ipc.on(NOTIFICATION_CHANNELS.click, (_event, id) => {
        if (typeof id === 'string') {
          listener(id);
        }
      });
    },
  };
}

/** The page's side of screen shares: start, end and stop, on fixed channels (#161). */
export function createShareBridge(ipc: PreloadIpc): ShareBridge {
  return {
    started: (id) => {
      ipc.send(SHARE_CHANNELS.started, id);
    },
    ended: (id) => {
      ipc.send(SHARE_CHANNELS.ended, id);
    },
    onStop: (listener) => {
      ipc.on(SHARE_CHANNELS.stop, (_event, id) => {
        if (typeof id === 'string') {
          listener(id);
        }
      });
    },
  };
}

/**
 * The assistant bar's side of its five user actions, on fixed channels
 * (ADR 0013). Only the adapter's isolated world gets it, never WhatsApp's.
 */
export function createAssistantBarBridge(ipc: Pick<PreloadIpc, 'send'>): AssistantBarBridge {
  return {
    suggest: () => {
      ipc.send(ASSISTANT_BAR_CHANNELS.suggest);
    },
    prompt: (text) => {
      ipc.send(ASSISTANT_BAR_CHANNELS.prompt, text);
    },
    confirm: () => {
      ipc.send(ASSISTANT_BAR_CHANNELS.confirm);
    },
    use: (index) => {
      ipc.send(ASSISTANT_BAR_CHANNELS.use, index);
    },
    send: (index) => {
      ipc.send(ASSISTANT_BAR_CHANNELS.send, index);
    },
    choose: (value) => {
      ipc.send(ASSISTANT_BAR_CHANNELS.choose, value);
    },
  };
}

/**
 * The chat list divider's side of its two actions, on fixed channels (#79).
 * Only the adapter's isolated world gets it, never WhatsApp's.
 */
export function createChatListBridge(ipc: Pick<PreloadIpc, 'send'>): ChatListBridge {
  return {
    resize: (width) => {
      ipc.send(CHAT_LIST_CHANNELS.resize, width);
    },
    reset: () => {
      ipc.send(CHAT_LIST_CHANNELS.reset);
    },
  };
}
