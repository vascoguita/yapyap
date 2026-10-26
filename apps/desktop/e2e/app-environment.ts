import { join } from 'node:path';

// Editors built on Electron (such as VS Code) export ELECTRON_RUN_AS_NODE to
// their terminals, which would make a development build start as plain Node.js.
// A desktop session's WAYLAND_DISPLAY and XDG_SESSION_TYPE would send the app
// to the real Wayland display instead of the virtual X11 one CI uses.
const DROPPED = new Set(['ELECTRON_RUN_AS_NODE', 'WAYLAND_DISPLAY']);

/** CI sets this to a headless Wayland compositor's socket to test the Wayland backend (#41). */
const WAYLAND_UNDER_TEST = 'YAPYAP_E2E_WAYLAND_DISPLAY';

/**
 * The app's environment for a test run. Autostart entries go under the
 * throwaway profile, so a run never changes the developer's own login items.
 */
export function appEnvironment(origin: string, profile: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !DROPPED.has(key)) {
      env[key] = value;
    }
  }
  const wayland = process.env[WAYLAND_UNDER_TEST] ?? '';
  return {
    ...env,
    ...(wayland === '' ? {} : { WAYLAND_DISPLAY: wayland }),
    // Chromium also goes to Wayland when the session says so, through the
    // default socket even without WAYLAND_DISPLAY, which would put a local
    // run's windows on the developer's desktop.
    XDG_SESSION_TYPE: wayland === '' ? 'x11' : 'wayland',
    XDG_CONFIG_HOME: join(profile, 'xdg-config'),
    YAPYAP_TEST_WHATSAPP_ORIGIN: origin,
  };
}

/** The backend tests expect the app to pick on its own. */
export function expectedLinuxBackend(): 'Wayland' | 'X11' {
  return (process.env[WAYLAND_UNDER_TEST] ?? '') === '' ? 'X11' : 'Wayland';
}
