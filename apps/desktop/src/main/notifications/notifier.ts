import { en } from '../../shared/messages/en.ts';

/** A system notification, as Electron's `Notification` offers it. */
interface NativeNotification {
  show(): void;
  close(): void;
  on(event: 'click', listener: () => void): unknown;
}

export interface NativeOptions {
  readonly title: string;
  readonly body: string;
  readonly silent: boolean;
}

export interface NotifierDependencies {
  readonly create: (options: NativeOptions) => NativeNotification;
  readonly isSupported: () => boolean;
  readonly now: () => number;
  readonly warn: (message: string) => void;
}

export interface NotifierAccount {
  /** The account's name, shown when there is more than one account. */
  readonly heading: () => string | undefined;
  readonly onClick: (id: string) => void;
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
  const heading = account.heading();
  const title =
    heading === undefined
      ? notification.title
      : en.notifications.titled(heading, notification.title);
  const native = deps.create({ title, body: notification.body, silent: notification.silent });
  native.on('click', () => {
    account.onClick(notification.id);
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
  const allowed = rateLimiter(deps.now);
  const available = availability(deps);
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
      if (!allowed()) {
        deps.warn('Dropped a notification: WhatsApp sent too many at once.');
        return;
      }
      if (available()) {
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
