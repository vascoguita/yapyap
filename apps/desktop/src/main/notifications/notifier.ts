import { en } from '../../shared/messages/en.ts';

/** A system notification, as Electron's `Notification` offers it. */
interface NativeNotification {
  show(): void;
  close(): void;
  on(event: 'click', listener: () => void): unknown;
  on(event: 'reply', listener: (details: { readonly reply: string }) => void): unknown;
}

export interface NativeOptions {
  readonly title: string;
  readonly body: string;
  readonly silent: boolean;
  /** An inline reply field, where the system offers one (macOS and Windows). */
  readonly hasReply?: boolean;
  readonly replyPlaceholder?: string;
}

/** What a notification may reveal (#62); read for each notification. */
interface NotificationPrivacy {
  readonly sender: boolean;
  readonly text: boolean;
}

export interface NotifierDependencies {
  readonly create: (options: NativeOptions) => NativeNotification;
  readonly privacy: () => NotificationPrivacy;
  readonly isSupported: () => boolean;
  /** Whether the system's notifications take an inline reply (#60). */
  readonly inlineReply: boolean;
  readonly now: () => number;
  readonly warn: (message: string) => void;
}

export interface NotifierAccount {
  /** The account's name, shown when there is more than one account. */
  readonly heading: () => string | undefined;
  /** Do not disturb is on, or the account is muted (#61). */
  readonly silenced: () => boolean;
  readonly onClick: (id: string) => void;
  /** The text is message content: it goes to WhatsApp's message box and nowhere else. */
  readonly onReply: (id: string, text: string) => void;
}

/** What a WhatsApp page may do with its notifications (ADR 0011). */
export interface AccountNotifier {
  readonly show: (request: unknown) => void;
  readonly close: (id: unknown) => void;
  readonly closeAll: () => void;
}

const MAX_ID = 32;
const MAX_TITLE = 256;
const MAX_BODY = 1000;
const LIMIT_PER_MINUTE = 30;
const MINUTE_MS = 60_000;

interface Checked {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly silent: boolean;
}

const optionalText = (value: unknown, max: number): string | undefined => {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value.slice(0, max) : undefined;
};

/** Plain text and flags only; anything else means the page sent something odd. */
function check(request: unknown): Checked | undefined {
  const { id, title, body, tag, silent } = Object(request) as Record<string, unknown>;
  const bodyText = optionalText(body, MAX_BODY);
  const tagText = optionalText(tag, MAX_ID);
  if (typeof id !== 'string' || id.length > MAX_ID || typeof title !== 'string') {
    return undefined;
  }
  if (bodyText === undefined || tagText === undefined) {
    return undefined;
  }
  if (silent !== undefined && typeof silent !== 'boolean') {
    return undefined;
  }
  return {
    id,
    title: title.slice(0, MAX_TITLE),
    body: bodyText,
    tag: tagText,
    silent: silent === true,
  };
}

/** Notifications shown in the last minute, to stop a page from flooding the desktop. */
function rateLimiter(now: () => number): () => boolean {
  let recent: number[] = [];
  return () => {
    const time = now();
    recent = recent.filter((shown) => time - shown < MINUTE_MS);
    if (recent.length >= LIMIT_PER_MINUTE) {
      return false;
    }
    recent.push(time);
    return true;
  };
}

/** Whether the system can show notifications; a missing service is logged once per outage. */
function availability(deps: NotifierDependencies): () => boolean {
  let unsupported = false;
  return () => {
    const supported = deps.isSupported();
    if (!supported && !unsupported) {
      deps.warn('No notification service is available; YapYap will keep trying.');
    }
    unsupported = !supported;
    return supported;
  };
}

/** Whether the system should show one more notification now. */
function admission(deps: NotifierDependencies): () => boolean {
  const allowed = rateLimiter(deps.now);
  const available = availability(deps);
  return () => {
    if (!allowed()) {
      deps.warn('Dropped a notification: WhatsApp sent too many at once.');
      return false;
    }
    return available();
  };
}

type Shown = Map<string, { readonly native: NativeNotification; readonly tag: string }>;

/** Shows a checked notification, replacing any with the same tag, as the Web API does. */
function display(
  deps: NotifierDependencies,
  account: NotifierAccount,
  shown: Shown,
  notification: Checked,
): void {
  for (const [id, entry] of shown) {
    if (notification.tag !== '' && entry.tag === notification.tag) {
      entry.native.close();
      shown.delete(id);
    }
  }
  const privacy = deps.privacy();
  const sender = privacy.sender ? notification.title : en.notifications.hiddenSender;
  const heading = account.heading();
  const title = heading === undefined ? sender : en.notifications.titled(heading, sender);
  const body = privacy.text ? notification.body : en.notifications.hiddenText;
  const reply = deps.inlineReply
    ? { hasReply: true, replyPlaceholder: en.notifications.replyPlaceholder }
    : {};
  const native = deps.create({ title, body, silent: notification.silent, ...reply });
  native.on('click', () => {
    account.onClick(notification.id);
  });
  native.on('reply', ({ reply: text }) => {
    account.onReply(notification.id, text);
  });
  shown.set(notification.id, { native, tag: notification.tag });
  native.show();
}

/**
 * Shows one account's WhatsApp notifications as system notifications. Their
 * text is message content: it goes to the system and nowhere else.
 */
export function accountNotifier(
  deps: NotifierDependencies,
  account: NotifierAccount,
): AccountNotifier {
  const shown: Shown = new Map();
  const admitted = admission(deps);
  const close = (id: string): void => {
    shown.get(id)?.native.close();
    shown.delete(id);
  };
  return {
    show: (request) => {
      const notification = check(request);
      if (notification === undefined) {
        deps.warn('Dropped a malformed notification from WhatsApp.');
        return;
      }
      // A silenced account's notifications count against no limit.
      if (!account.silenced() && admitted()) {
        display(deps, account, shown, notification);
      }
    },
    close: (id) => {
      if (typeof id === 'string') {
        close(id);
      }
    },
    closeAll: () => {
      for (const id of shown.keys()) {
        close(id);
      }
    },
  };
}
