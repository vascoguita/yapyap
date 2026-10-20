# 0001. Electron process model and security boundaries

- Status: Accepted
- Date: 2026-10-18

## Context

YapYap loads a remote, third-party web application (WhatsApp Web) that we do
not control, renders its own trusted UI around it, and later hosts third-party
plugins. Each of these has a different trust level, and they must never share
privileges. WhatsApp builds and tests for current Chromium, so the engine must
be a stock, current Chromium with a matching user agent.

## Decision

### Trust zones

| Zone       | Process                                | Trust                         | Content                                                                                             |
| ---------- | -------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Main       | Electron main (Node)                   | Trusted                       | App logic, settings, IPC validation, plugin host, capability checker                                |
| App chrome | Renderer, `app://chrome/`              | Trusted code, untrusted input | Account switcher, settings, dialogs, recovery UI, plugin UI rendered from declarative contributions |
| WhatsApp   | One renderer per account               | Untrusted (remote)            | `https://web.whatsapp.com` plus the WhatsApp adapter preload in an isolated world                   |
| Plugin     | One hidden renderer per enabled plugin | Untrusted (third party)       | Plugin bundle served from `plugin://<id>/`                                                          |

### Window composition

One `BaseWindow` holds a chrome `WebContentsView` (sidebar and overlays) and
one `WebContentsView` per account. Only the active account's view is attached;
inactive accounts stay loaded so they keep receiving notifications. Each
account uses its own persistent session partition `persist:account-<uuid>`, so
cookies, IndexedDB, service workers and cache never cross accounts.

### Web preferences (all web content, no exceptions)

`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`,
`nodeIntegrationInWorker: false`, `nodeIntegrationInSubFrames: false`,
`webviewTag: false`, `webSecurity: true`, `allowRunningInsecureContent: false`,
`experimentalFeatures: false`, `enableBlinkFeatures` unset,
`navigateOnDragDrop: false`, `spellcheck` only on WhatsApp views. A single
factory function produces web preferences; a unit test asserts every field,
and an ESLint restriction forbids constructing `BrowserWindow` or
`WebContentsView` elsewhere.

### IPC

- Preloads expose a minimal, typed API with `contextBridge`, one function per
  operation. They never expose `ipcRenderer` itself or any generic
  send/invoke.
- Every IPC handler in main validates the sender frame (its origin and its
  `webContents` role) and validates the payload against a schema before it
  acts. A payload that fails validation is dropped and logged without its
  content.
- The WhatsApp adapter sends only plain data objects (unread count,
  notification fields, active-chat metadata). It never sends DOM nodes or HTML.

### Navigation, windows and permissions

- `will-navigate` and `will-redirect` allow the main frame to navigate only
  within the view's home origin. A cancelled click goes through the link
  policy below; a cancelled redirect is simply dropped. Subframes are left to
  the page's own CSP and the sandbox, because WhatsApp plays some link
  previews inline in iframes (ADR 0008, C14). Web contents YapYap did not
  create have no home origin, so none of their main-frame navigations stay.
- `setWindowOpenHandler` denies every request after routing its URL through
  the link policy: `http(s)` URLs open in the default browser, and `mailto:`
  and `tel:` are parsed, validated and re-serialized before
  `shell.openExternal` (phone numbers keep only digits and a leading `+`).
  `whatsapp://send` deep links load the matching WhatsApp Web URL in the
  view. All other schemes are dropped.
- The one exception is an empty `about:blank` popup, which WhatsApp opens
  before setting its location. It is created hidden with the hardened
  preferences, its first navigation goes through the link policy, and it is
  destroyed then, or after five seconds if it never navigates.
- `setPermissionRequestHandler` and `setPermissionCheckHandler` use a
  per-zone allowlist, applied to every session. The WhatsApp zone, from its
  own origin only, gets `notifications`, `clipboard-sanitized-write`,
  `fullscreen`, `speaker-selection` (so calls can use the chosen output
  device) and `media`. `media` asks first, naming the account, and the answer
  lasts until the app quits. Chrome and plugin zones get nothing, and neither
  do web contents YapYap did not create.
- `openExternal` permission requests (external-app launches from any frame)
  are always refused to Chromium; their URL goes through the link policy
  instead, so it opens at most once and only for allowed schemes.
- `setDevicePermissionHandler` denies by default (no WebHID, WebUSB or
  WebSerial), and every Web Bluetooth device chooser is cancelled, because
  Electron otherwise picks the first nearby device.
- **Screen sharing** goes through `setDisplayMediaRequestHandler`, so calls
  work while consent stays explicit:
  - It is accepted only from a WhatsApp frame (an account view or that
    account's call window) whose window is visible and focused. Requests from
    hidden accounts, chrome or plugins are rejected.
  - The source is always chosen by the user, never preselected. On macOS 15+
    this uses the system picker (`useSystemPicker: true`). Electron then never
    calls the handler, so the visible-and-focused check does not apply there,
    but the OS picker is itself an explicit, visible consent. On Linux
    Wayland it uses the xdg-desktop-portal ScreenCast picker over PipeWire.
    On Windows, X11 and older macOS it uses YapYap's own accessible picker,
    built from `desktopCapturer.getSources` with screen and window thumbnails
    (#146; until then, those requests are denied).
  - System audio (`loopback`) is offered on Windows only, as an explicit
    checkbox in the picker.
  - Cancelling the picker rejects the request cleanly, so WhatsApp sees a
    normal "permission denied". While sharing, the tray and the account's
    sidebar entry show a persistent "sharing" indicator with a stop action.
  - We do not require a page user gesture, because WhatsApp can request
    capture asynchronously inside a call. The picker choice is the consent.
- A `web-contents-created` hook attaches all of the above to every new
  `webContents`, including ones we did not create ourselves.

### Content Security Policy

- App chrome: `default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data:; font-src 'self'; connect-src 'none';
frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, served
  from a custom `app://` protocol, not `file://`.
- Plugins: `default-src 'none'; script-src 'self'`, plus `style-src 'self'`
  and `img-src 'self' data:` for panels. See [ADR 0004](0004-plugin-isolation-and-trust-model.md).
- WhatsApp keeps its own CSP. We do not weaken it.

### User agent

`app.userAgentFallback` and each account session use the standard desktop
Chrome UA for the bundled `process.versions.chrome`, with no `Electron/` or
`YapYap/` tokens. Client hints are rewritten to match. Without this, WhatsApp
may show its "unsupported browser" page.

### Custom CSS and JS

User CSS is applied with `webContents.insertCSS`. User JS runs only through
`webFrame.executeJavaScriptInIsolatedWorld` in a dedicated world ID, never in
the main world. The feature is labelled "Advanced" and stays off until the
user enables it.

### Electron fuses (applied at package time with `@electron/fuses`)

`RunAsNode: off`, `EnableCookieEncryption: on`,
`EnableNodeOptionsEnvironmentVariable: off`,
`EnableNodeCliInspectArguments: off`,
`EnableEmbeddedAsarIntegrityValidation: on`, `OnlyLoadAppFromAsar: on`,
`LoadBrowserProcessSpecificV8Snapshot: off`,
`GrantFileProtocolExtraPrivileges: off`. A packaging test reads the fuses
back from every build and asserts them.

### Electron security checklist compliance

| #   | Checklist item                                         | How YapYap complies                                                                              |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1   | Only load secure content                               | WhatsApp is HTTPS. Chrome and plugins use custom privileged protocols. Mixed content is blocked. |
| 2   | No Node.js integration for remote content              | `nodeIntegration: false` everywhere                                                              |
| 3   | Context isolation                                      | `contextIsolation: true` everywhere                                                              |
| 4   | Process sandboxing                                     | `sandbox: true` everywhere, plus `app.enableSandbox()`                                           |
| 5   | Permission request handler                             | Per-zone allowlists, see above                                                                   |
| 6   | Do not disable `webSecurity`                           | Never set                                                                                        |
| 7   | Define a CSP                                           | Chrome and plugin CSPs set as response headers                                                   |
| 8   | Do not enable `allowRunningInsecureContent`            | Never set                                                                                        |
| 9   | Do not enable experimental features                    | Never set                                                                                        |
| 10  | Do not use `enableBlinkFeatures`                       | Never set                                                                                        |
| 11  | `<webview>`: do not use `allowpopups`                  | `webviewTag: false`; `<webview>` is not used                                                     |
| 12  | Verify WebView options before creation                 | `will-attach-webview` always prevented                                                           |
| 13  | Disable or limit navigation                            | Navigation guards, see above                                                                     |
| 14  | Disable or limit creation of new windows               | `setWindowOpenHandler` denies                                                                    |
| 15  | Do not use `shell.openExternal` with untrusted content | Scheme allowlist, URL re-serialization, `http(s)`, `mailto` and `tel` only                       |
| 16  | Use a current version of Electron                      | Latest stable, kept current by Dependabot, nightly beta run                                      |
| 17  | Validate the `sender` of all IPC messages              | Sender frame origin and role checked in every handler                                            |
| 18  | Avoid the `file://` protocol                           | `app://` and `plugin://` custom protocols                                                        |
| 19  | Check which fuses you can change                       | Fuses table above, asserted in CI                                                                |
| 20  | Do not expose Electron APIs to untrusted web content   | Minimal typed bridges only                                                                       |

## Consequences

- Each account costs one renderer process. Idle memory per account becomes a
  tracked budget (M2).
- WhatsApp-specific DOM knowledge lives only in the adapter module (see
  [ADR 0005](0005-test-strategy.md) for how it is tested). A WhatsApp UI change
  becomes a one-file fix.
- Some conveniences are lost by design: no `<webview>`, no remote modules, no
  Node in any renderer.
