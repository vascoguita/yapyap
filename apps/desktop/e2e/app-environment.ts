// Editors built on Electron (such as VS Code) export ELECTRON_RUN_AS_NODE to
// their terminals, which would make a development build start as plain Node.js.
// A desktop session's WAYLAND_DISPLAY would send the app to the real Wayland
// display instead of the virtual X11 one CI uses.
const DROPPED = new Set(['ELECTRON_RUN_AS_NODE', 'WAYLAND_DISPLAY']);

/** CI sets this to a headless Wayland compositor's socket to test the Wayland backend (#41). */
const WAYLAND_UNDER_TEST = 'YAPYAP_E2E_WAYLAND_DISPLAY';

export function appEnvironment(origin: string): Record<string, string> {
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
    YAPYAP_TEST_WHATSAPP_ORIGIN: origin,
  };
}

/** The backend tests expect the app to pick on its own. */
export function expectedLinuxBackend(): 'Wayland' | 'X11' {
  return (process.env[WAYLAND_UNDER_TEST] ?? '') === '' ? 'X11' : 'Wayland';
}
