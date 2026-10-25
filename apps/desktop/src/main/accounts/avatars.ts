import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import { OWN_AVATAR } from '../../adapter/own-avatar.ts';
import { isSameOrigin } from '../navigation/link-policy.ts';

/** An account's WhatsApp page, as reading its profile photo needs it. */
export interface AvatarPage {
  executeJavaScriptInIsolatedWorld(worldId: number, scripts: { code: string }[]): Promise<unknown>;
  /** The account's own session, so the photo comes with its login, not the default one. */
  readonly session: { fetch(url: string): Promise<Response> };
}

export interface AvatarDependencies {
  /** WhatsApp's origin, from which a photo may also come (the fake page in tests). */
  readonly home: string;
  /** The image as a small square data URL, or undefined when it is not one. */
  readonly toDataUrl: (bytes: Uint8Array) => string | undefined;
  readonly now: () => number;
  /** A photo appeared, changed or went away, so the sidebar shows it. */
  readonly onChange: () => void;
}

/** Each account's profile photo, which the sidebar shows instead of its initial (#87). */
export interface AccountAvatars {
  /** Reads the account's photo again, if it is due; never throws. */
  readonly refresh: (id: string, page: AvatarPage) => Promise<void>;
  readonly avatarOf: (id: string) => string | undefined;
  readonly forget: (id: string) => void;
}

/** Until a photo is found, WhatsApp may still be loading; after, it rarely changes. */
const RETRY_MS = 60_000;
const REFRESH_MS = 1_800_000;
/** WhatsApp's profile photos are a few tens of kilobytes; nothing bigger is read. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Whether the page's photo may be fetched: over HTTPS from WhatsApp's media
 * hosts, or from the page's own origin. Anything else the page names stays
 * unfetched, so a changed page cannot make YapYap request other addresses.
 */
export function isAvatarUrl(url: string, home: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const { protocol, hostname } = new URL(url);
  const media = protocol === 'https:' && hostname.endsWith('.whatsapp.net');
  return media || isSameOrigin(url, home);
}

async function readAvatar(page: AvatarPage, deps: AvatarDependencies): Promise<string | undefined> {
  const src = await page.executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [{ code: OWN_AVATAR }]);
  if (typeof src !== 'string' || !isAvatarUrl(src, deps.home)) {
    return undefined;
  }
  const response = await page.session.fetch(src);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return response.ok && bytes.byteLength <= MAX_BYTES ? deps.toDataUrl(bytes) : undefined;
}

export function accountAvatars(deps: AvatarDependencies): AccountAvatars {
  const avatars = new Map<string, string>();
  const due = new Map<string, number>();
  return {
    refresh: async (id, page) => {
      if (deps.now() < (due.get(id) ?? 0)) {
        return;
      }
      const avatar = await readAvatar(page, deps).catch(() => undefined);
      due.set(id, deps.now() + (avatar === undefined ? RETRY_MS : REFRESH_MS));
      if (avatar !== avatars.get(id)) {
        if (avatar === undefined) {
          avatars.delete(id);
        } else {
          avatars.set(id, avatar);
        }
        deps.onChange();
      }
    },
    avatarOf: (id) => avatars.get(id),
    forget: (id) => {
      avatars.delete(id);
      due.delete(id);
    },
  };
}

/** An image as Electron's `nativeImage` holds it. */
interface ShrinkableImage {
  isEmpty(): boolean;
  resize(options: { width: number; height: number; quality: 'good' }): { toDataURL(): string };
}

/**
 * The photo as a 64-pixel PNG data URL: enough for the sidebar's avatar at
 * any scale, and nothing else of the downloaded image survives. Undefined
 * when the bytes were no image.
 */
export function shrinkAvatar(image: ShrinkableImage): string | undefined {
  return image.isEmpty()
    ? undefined
    : image.resize({ width: 64, height: 64, quality: 'good' }).toDataURL();
}
