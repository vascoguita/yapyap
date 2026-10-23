import { NOTIFICATION_CHANNELS } from '../../shared/notification-api.ts';
import { isSameOrigin } from '../navigation/link-policy.ts';
import type { AccountNotifier } from './notifier.ts';

export interface NotificationEvent {
  readonly sender: object;
  readonly senderFrame: { readonly url: string } | null;
}

export interface NotificationIpc {
  on(channel: string, listener: (event: NotificationEvent, ...args: unknown[]) => void): unknown;
}

/**
 * Routes WhatsApp's notification messages to its account. Only a WhatsApp
 * view's page on WhatsApp's own origin is heard; anything else is dropped,
 * and logged without its content.
 */
export function listenForNotifications(
  ipc: NotificationIpc,
  notifierOf: (sender: object) => AccountNotifier | undefined,
  origin: string,
  warn: (message: string) => void,
): void {
  const route = (event: NotificationEvent): AccountNotifier | undefined => {
    const notifier = notifierOf(event.sender);
    if (notifier === undefined || !isSameOrigin(event.senderFrame?.url ?? '', origin)) {
      warn('Ignored a notification message from outside WhatsApp.');
      return undefined;
    }
    return notifier;
  };
  ipc.on(NOTIFICATION_CHANNELS.show, (event, request) => {
    route(event)?.show(request);
  });
  ipc.on(NOTIFICATION_CHANNELS.close, (event, id) => {
    route(event)?.close(id);
  });
}
