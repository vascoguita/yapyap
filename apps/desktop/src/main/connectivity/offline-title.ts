import { en } from '../../shared/messages/en.ts';

export interface TitledWindow {
  on(
    event: 'page-title-updated',
    listener: (event: { preventDefault(): void }, title: string) => void,
  ): unknown;
  setTitle(title: string): void;
}

/**
 * Marks the window title while offline: unobtrusive, and visible in the
 * taskbar and window switcher. The page keeps choosing the rest of the title.
 */
export function offlineTitle(
  window: TitledWindow,
  initialTitle: string,
): (online: boolean) => void {
  let pageTitle = initialTitle;
  let online = true;
  const apply = (): void => {
    window.setTitle(online ? pageTitle : en.windows.offline(pageTitle));
  };
  window.on('page-title-updated', (event, title) => {
    event.preventDefault();
    pageTitle = title;
    apply();
  });
  return (isOnline) => {
    online = isOnline;
    apply();
  };
}
