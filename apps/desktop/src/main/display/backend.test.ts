import { describe, expect, it } from 'vitest';
import { chooseDisplayBackend, describeDisplayBackend, type BackendInputs } from './backend.ts';

const WAYLAND_SESSION = { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' };
const X11_SESSION = { DISPLAY: ':0' };

function choose(overrides: Partial<BackendInputs>) {
  return chooseDisplayBackend({
    platform: 'linux',
    setting: 'auto',
    argv: [],
    env: WAYLAND_SESSION,
    ...overrides,
  });
}

describe('chooseDisplayBackend', () => {
  it('leaves other platforms alone', () => {
    expect(choose({ platform: 'win32', setting: 'x11', argv: ['--ozone-platform=x11'] })).toEqual({
      ozonePlatform: undefined,
      active: undefined,
      source: 'automatic',
      fallback: undefined,
    });
  });

  it('lets Chromium choose automatically: Wayland when a Wayland display exists', () => {
    expect(choose({})).toEqual({
      ozonePlatform: undefined,
      active: 'wayland',
      source: 'automatic',
      fallback: undefined,
    });
    expect(choose({ env: X11_SESSION }).active).toBe('x11');
    expect(choose({ env: { WAYLAND_DISPLAY: '', DISPLAY: ':0' } }).active).toBe('x11');
  });

  it.each([
    ['wayland', 'wayland'],
    ['x11', 'x11'],
  ] as const)('forces the %s backend chosen in settings', (setting, active) => {
    expect(choose({ setting })).toEqual({
      ozonePlatform: active,
      active,
      source: 'settings',
      fallback: undefined,
    });
  });

  it('falls back to the automatic choice when the chosen display server is missing', () => {
    expect(choose({ setting: 'wayland', env: X11_SESSION })).toEqual({
      ozonePlatform: undefined,
      active: 'x11',
      source: 'automatic',
      fallback:
        'The Wayland display backend was chosen in settings, but WAYLAND_DISPLAY is not set; using the automatic choice.',
    });
    expect(choose({ setting: 'x11', env: { WAYLAND_DISPLAY: 'wayland-0' } })).toEqual({
      ozonePlatform: undefined,
      active: 'wayland',
      source: 'automatic',
      fallback:
        'The X11 display backend was chosen in settings, but DISPLAY is not set; using the automatic choice.',
    });
  });

  it.each([
    ['--ozone-platform=x11', 'x11'],
    ['--ozone-platform-hint=x11', 'x11'],
    ['--ozone-platform=wayland', 'wayland'],
    ['--ozone-platform-hint=auto', 'wayland'],
    ['--ozone-platform=', 'wayland'],
  ] as const)('lets the command-line flag %s win and leaves it to Chromium', (flag, active) => {
    expect(
      choose({
        setting: 'x11',
        argv: ['/opt/YapYap/yapyap', flag],
        env: { ...WAYLAND_SESSION, ELECTRON_OZONE_PLATFORM_HINT: 'x11' },
      }),
    ).toEqual({ ozonePlatform: undefined, active, source: 'command line', fallback: undefined });
  });

  it('ignores flags that only look like the ozone switch', () => {
    expect(choose({ argv: ['--ozone-platform-x=x11', 'ozone-platform=x11'] }).source).toBe(
      'automatic',
    );
  });

  it.each([
    ['x11', 'x11'],
    ['wayland', 'wayland'],
    ['auto', 'wayland'],
  ] as const)('applies ELECTRON_OZONE_PLATFORM_HINT=%s over the setting', (hint, active) => {
    expect(
      choose({ setting: 'x11', env: { ...WAYLAND_SESSION, ELECTRON_OZONE_PLATFORM_HINT: hint } }),
    ).toEqual({ ozonePlatform: active, active, source: 'environment', fallback: undefined });
  });

  it('ignores an empty ELECTRON_OZONE_PLATFORM_HINT', () => {
    expect(choose({ env: { ...X11_SESSION, ELECTRON_OZONE_PLATFORM_HINT: '' } }).source).toBe(
      'automatic',
    );
  });
});

describe('describeDisplayBackend', () => {
  it('names the backend and where the choice came from', () => {
    expect(describeDisplayBackend(choose({}))).toBe('Wayland (automatic)');
    expect(describeDisplayBackend(choose({ setting: 'x11' }))).toBe('X11 (settings)');
    expect(describeDisplayBackend(choose({ platform: 'darwin' }))).toBe('native');
  });
});
