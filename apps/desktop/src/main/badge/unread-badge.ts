import { en } from '../../shared/messages/en.ts';
import { drawBadge, type BadgeDrawing } from './badge-image.ts';

export interface BadgeDependencies<Image> {
  readonly platform: string;
  /** The Dock badge on macOS and the launcher count on Linux desktops that show one. */
  readonly setBadgeCount: (count: number) => boolean;
  /** The Windows taskbar overlay; `null` removes it. */
  readonly setOverlayIcon: (overlay: Image | null, description: string) => void;
  readonly createImage: (drawing: BadgeDrawing) => Image;
}

/**
 * Shows a count of unread chats where the platform shows app badges. It
 * returns the function to call with each new count; repeating a count does
 * nothing, so the overlay is not redrawn for every title change.
 */
export function unreadBadge<Image>(deps: BadgeDependencies<Image>): (count: number) => void {
  let shown = 0;
  return (count) => {
    if (count === shown) {
      return;
    }
    shown = count;
    if (deps.platform !== 'win32') {
      deps.setBadgeCount(count);
      return;
    }
    deps.setOverlayIcon(
      count === 0 ? null : deps.createImage(drawBadge(count)),
      count === 0 ? '' : en.badge.unread({ count }),
    );
  };
}
