/**
 * The three sizes a chrome window comes in, so windows that do the same kind
 * of job open alike. A dialog's height follows its content, so only its
 * width is shared. A medium window fits one 600 px column of the shared
 * stylesheet, and a large one a page list beside it.
 */
export const WINDOW_SIZES = {
  dialogWidth: 440,
  medium: { width: 600, height: 640, minWidth: 440, minHeight: 400 },
  large: { width: 820, height: 640, minWidth: 600, minHeight: 480 },
} as const;
