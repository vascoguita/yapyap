import { describe, expect, it } from 'vitest';
import { boundsOnScreen, DEFAULT_WINDOW_STATE, parseWindowState } from './window-state.ts';

const SAVED = {
  bounds: { x: 100, y: 50, width: 1000, height: 700 },
  maximized: true,
  fullScreen: false,
};

describe('parseWindowState', () => {
  it('reads a saved state', () => {
    expect(parseWindowState(JSON.stringify(SAVED))).toEqual(SAVED);
    expect(parseWindowState('{"maximized":false,"fullScreen":true}')).toEqual({
      maximized: false,
      fullScreen: true,
    });
  });

  it.each([
    undefined,
    '',
    'not json',
    'null',
    '[]',
    '{"maximized":"yes","fullScreen":false}',
    '{"bounds":{"x":0,"y":0,"width":0,"height":10},"maximized":false,"fullScreen":false}',
    '{"bounds":{"x":0.5,"y":0,"width":10,"height":10},"maximized":false,"fullScreen":false}',
  ])('falls back to the default for %j', (text) => {
    expect(parseWindowState(text)).toEqual(DEFAULT_WINDOW_STATE);
  });
});

describe('boundsOnScreen', () => {
  const MAIN = { x: 0, y: 0, width: 1920, height: 1040 };
  const RIGHT = { x: 1920, y: 0, width: 1280, height: 1000 };

  it('keeps bounds that land on a display', () => {
    expect(boundsOnScreen(SAVED, [MAIN])).toEqual(SAVED.bounds);
    const onRight = { ...SAVED, bounds: { x: 2000, y: 100, width: 800, height: 600 } };
    expect(boundsOnScreen(onRight, [MAIN, RIGHT])).toEqual(onRight.bounds);
  });

  it('drops bounds left on a display that is gone', () => {
    const onRight = { ...SAVED, bounds: { x: 2000, y: 100, width: 800, height: 600 } };
    expect(boundsOnScreen(onRight, [MAIN])).toBeUndefined();
  });

  it('needs enough of the window on screen to grab it, in both directions', () => {
    const corner = (x: number, y: number) => ({
      ...SAVED,
      bounds: { x, y, width: 800, height: 600 },
    });
    expect(boundsOnScreen(corner(1920 - 64, 0), [MAIN])).toBeDefined();
    expect(boundsOnScreen(corner(1920 - 63, 0), [MAIN])).toBeUndefined();
    expect(boundsOnScreen(corner(0, 1040 - 64), [MAIN])).toBeDefined();
    expect(boundsOnScreen(corner(0, 1040 - 63), [MAIN])).toBeUndefined();
    expect(boundsOnScreen(corner(-800 + 64, -600 + 64), [MAIN])).toBeDefined();
    expect(boundsOnScreen(corner(-800 + 63, 0), [MAIN])).toBeUndefined();
  });

  it('has nothing to place without saved bounds', () => {
    expect(boundsOnScreen(DEFAULT_WINDOW_STATE, [MAIN])).toBeUndefined();
  });
});
