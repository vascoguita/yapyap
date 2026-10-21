import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const WindowStateSchema = Type.Object({
  bounds: Type.Optional(
    Type.Object({
      x: Type.Integer(),
      y: Type.Integer(),
      width: Type.Integer({ minimum: 1 }),
      height: Type.Integer({ minimum: 1 }),
    }),
  ),
  maximized: Type.Boolean(),
  fullScreen: Type.Boolean(),
});

export type WindowState = Static<typeof WindowStateSchema>;

export const DEFAULT_WINDOW_STATE: WindowState = { maximized: false, fullScreen: false };

/** The saved state, or the default when the file is missing, corrupt or from elsewhere. */
export function parseWindowState(text: string | undefined): WindowState {
  try {
    const value: unknown = JSON.parse(text ?? '');
    return Value.Check(WindowStateSchema, value) ? value : DEFAULT_WINDOW_STATE;
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

/** Enough of the title bar to grab, so a restored window can always be moved back. */
const MIN_VISIBLE = 64;

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width, height };
}

/**
 * Keeps saved bounds only while enough of the window lands on a connected
 * display; a monitor that was unplugged must not leave the window off screen.
 */
export function boundsOnScreen(state: WindowState, workAreas: readonly Rect[]): Rect | undefined {
  const { bounds } = state;
  if (bounds === undefined) return undefined;
  const visible = workAreas.some((area) => {
    const shared = overlap(bounds, area);
    return shared.width >= MIN_VISIBLE && shared.height >= MIN_VISIBLE;
  });
  return visible ? bounds : undefined;
}
