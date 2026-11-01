import { isSameOrigin } from '../navigation/link-policy.ts';
import type { ViewRegistry } from '../views.ts';
import type { PayloadCheck } from './arguments.ts';

export interface WhatsAppEvent<Sender extends object> {
  readonly sender: Sender;
  readonly senderFrame: { readonly url: string } | null;
}

export interface WhatsAppIpc<Sender extends object = object> {
  on(
    channel: string,
    listener: (event: WhatsAppEvent<Sender>, ...args: unknown[]) => void,
  ): unknown;
}

/** Who sent a message: a WhatsApp page, or a window it opened, of one account. */
interface WhatsAppCall<Sender extends object = object> {
  readonly sender: Sender;
  readonly account: string;
}

export interface WhatsAppListener<Sender extends object = object> {
  readonly channel: string;
  /** Rejects any payload the message does not carry. */
  readonly accepts: PayloadCheck;
  readonly handle: (call: WhatsAppCall<Sender>, ...args: unknown[]) => void;
}

export interface WhatsAppSenders {
  readonly views: ViewRegistry;
  /** WhatsApp's own origin, the only one heard. */
  readonly origin: string;
  readonly warn: (message: string) => void;
}

/**
 * Hears messages from WhatsApp's preload. Each must come from a WhatsApp
 * view of an account, or a window it opened, on WhatsApp's own origin, and
 * carry a payload the listener accepts, so no other page can speak for an
 * account. Anything else is dropped and logged without its content.
 */
export function registerWhatsAppListeners<Sender extends object>(
  ipc: WhatsAppIpc<Sender>,
  senders: WhatsAppSenders,
  listeners: readonly WhatsAppListener<Sender>[],
): void {
  for (const { channel, accepts, handle } of listeners) {
    ipc.on(channel, ({ sender, senderFrame }, ...args) => {
      const view = senders.views.get(sender);
      const fromWhatsApp =
        view?.zone === 'whatsapp' && isSameOrigin(senderFrame?.url ?? '', senders.origin);
      if (!fromWhatsApp || view.account === undefined || !accepts(args)) {
        senders.warn(`Ignored a message on ${channel}.`);
        return;
      }
      handle({ sender, account: view.account }, ...args);
    });
  }
}
