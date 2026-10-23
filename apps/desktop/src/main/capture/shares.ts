import { SHARE_CHANNELS } from '../../shared/share-api.ts';
import { isSameOrigin } from '../navigation/link-policy.ts';

interface ShareSender {
  send(channel: string, ...args: unknown[]): void;
  once(event: 'destroyed', listener: () => void): unknown;
}

interface ShareEvent {
  readonly sender: ShareSender;
  readonly senderFrame: { readonly url: string } | null;
}

export interface ShareIpc {
  on(channel: string, listener: (event: ShareEvent, ...args: unknown[]) => void): unknown;
}

export interface ShareDependencies {
  /** The account a WhatsApp page or call window belongs to. */
  readonly accountOf: (sender: object) => string | undefined;
  readonly origin: string;
  readonly onChange: () => void;
  readonly warn: (message: string) => void;
}

/** The screen shares running in every account (#161). */
export interface ScreenShares {
  /** The accounts sharing a screen or window right now. */
  readonly sharing: () => ReadonlySet<string>;
  /** Asks the account's pages to stop every share; they report each end. */
  readonly stop: (account: string) => void;
}

/** The page's share IDs are UUIDs. */
const MAX_ID = 36;

const isId = (id: unknown): id is string => typeof id === 'string' && id.length <= MAX_ID;

type SharesBySender = Map<ShareSender, Map<string, string>>;

/** A sender's shares, by ID, each with its account; a page that goes takes its shares along. */
function sharesOf(
  bySender: SharesBySender,
  sender: ShareSender,
  onChange: () => void,
): Map<string, string> {
  const known = bySender.get(sender);
  if (known !== undefined) {
    return known;
  }
  const shares = new Map<string, string>();
  bySender.set(sender, shares);
  sender.once('destroyed', () => {
    bySender.delete(sender);
    onChange();
  });
  return shares;
}

/**
 * Hears the WhatsApp stand-in's share reports. Only a WhatsApp page of an
 * account, on WhatsApp's own origin, is heard. A page that goes away takes
 * its shares with it, since its capture ends with it.
 */
export function trackShares(ipc: ShareIpc, deps: ShareDependencies): ScreenShares {
  const bySender: SharesBySender = new Map();
  ipc.on(SHARE_CHANNELS.started, (event, id) => {
    const account = deps.accountOf(event.sender);
    if (account === undefined || !isSameOrigin(event.senderFrame?.url ?? '', deps.origin)) {
      deps.warn('Ignored a screen share message from outside WhatsApp.');
      return;
    }
    if (isId(id)) {
      sharesOf(bySender, event.sender, deps.onChange).set(id, account);
      deps.onChange();
    }
  });
  ipc.on(SHARE_CHANNELS.ended, (event, id) => {
    if (isId(id) && bySender.get(event.sender)?.delete(id) === true) {
      deps.onChange();
    }
  });
  return {
    sharing: () => new Set([...bySender.values()].flatMap((shares) => [...shares.values()])),
    stop: (account) => {
      for (const [sender, shares] of bySender) {
        for (const [id, owner] of shares) {
          if (owner === account) {
            sender.send(SHARE_CHANNELS.stop, id);
          }
        }
      }
    },
  };
}
