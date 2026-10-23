export interface FocusableWindow {
  on(event: 'focus', listener: () => void): unknown;
}

export interface FocusablePage {
  focus(): void;
}

/**
 * A window whose content is a view focuses its own, empty page, so typing
 * would go nowhere until the user clicked WhatsApp; this hands focus on.
 */
export function focusPageWithWindow(window: FocusableWindow, page: FocusablePage): void {
  window.on('focus', () => {
    page.focus();
  });
}
