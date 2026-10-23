import { en } from '../../shared/messages/en.ts';

export interface TitledWindow {
  setTitle(title: string): void;
}

/** The web contents whose page title the window shows. */
export interface TitledPage {
  on(
    event: 'page-title-updated',
    listener: (event: { preventDefault(): void }, title: string) => void,
  ): unknown;
}

/**
 * Marks the window title while offline: unobtrusive, and visible in the
 * taskbar and window switcher. The page keeps choosing the rest of the title.
 */
export function offlineTitle(
  window: TitledWindow,
  page: TitledPage,
  initialTitle: string,
): (online: boolean) => void {
  let pageTitle = initialTitle;
  let online = true;
  const apply = (): void => {
    window.setTitle(online ? pageTitle : en.windows.offline(pageTitle));
  };
  page.on('page-title-updated', (_event, title) => {
    pageTitle = title;
    apply();
  });
  return (isOnline) => {
    online = isOnline;
    apply();
  };
}
