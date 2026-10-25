# Security review

Reviewed on 2026-10-25 (#112), against
[Electron's security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
and the plugin threat model of [ADR 0004](/adr/0004-plugin-isolation-and-trust-model).
Each answer names the code that enforces it and the tests that prove it.
Repeat the review before each release that changes a trust boundary.

## Electron's checklist

| #   | Item                                     | Status | How YapYap meets it                                                                                                                                                                                                         |
| --- | ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Only load secure content                 | Met    | WhatsApp loads from `https://web.whatsapp.com` (`whatsapp-origin.ts`); YapYap's pages from `app://`, plugins from `plugin://`. The test-only origin override takes loopback only (ADR 0008, C2).                            |
| 2   | No Node.js integration for remote pages  | Met    | `nodeIntegration`, in workers and subframes too, is off in `rendererPreferences`; `e2e/launch.spec.ts` checks WhatsApp has no `require` or `process`.                                                                       |
| 3   | Context isolation                        | Met    | On for every renderer; preloads expose only typed `contextBridge` APIs.                                                                                                                                                     |
| 4   | Process sandboxing                       | Met    | `sandbox: true` everywhere and `app.enableSandbox()`; YapYap refuses to start unsandboxed (`sandbox-check.ts`). `e2e/launch.spec.ts` and the packaged smoke test check every renderer.                                      |
| 5   | Handle permission requests               | Met    | Deny by default; WhatsApp's own origin gets an allowlist, screen capture needs a user pick (`permissions/`, ADR 0001, 0008 C6 and C15). Tested in `permission-policy.test.ts`, `session-guard.test.ts` and E2E.             |
| 6   | Keep `webSecurity`                       | Met    | `createSecureWindow` applies the hardened preferences last, and lint forbids creating windows anywhere else; `windows.test.ts` shows smuggled preferences are ignored.                                                      |
| 7   | Content Security Policy                  | Met    | Strict CSP headers on `app://` (`chrome/assets.ts`) and `plugin://` (`plugin-files.ts`). WhatsApp keeps its own.                                                                                                            |
| 8   | No `allowRunningInsecureContent`         | Met    | Off in `rendererPreferences`.                                                                                                                                                                                               |
| 9   | No experimental features                 | Met    | Off in `rendererPreferences`.                                                                                                                                                                                               |
| 10  | No `enableBlinkFeatures`                 | Met    | Never set; `RendererOptions` only takes a preload, a partition and spell checking.                                                                                                                                          |
| 11  | `<webview>` `allowpopups`                | N/A    | `webviewTag` is off and every `will-attach-webview` is refused (`web-contents-guards.ts`).                                                                                                                                  |
| 12  | `<webview>` options                      | N/A    | As above.                                                                                                                                                                                                                   |
| 13  | Limit navigation                         | Met    | The main frame stays on its home origin; other links go through the link policy, and redirects off the origin are stopped (`navigation/`). Subframes are left to WhatsApp's CSP and the sandbox, by design (ADR 0008, C14). |
| 14  | Limit new windows                        | Met    | `setWindowOpenHandler` on every web contents: plugins open none, WhatsApp only its own-origin call windows (ADR 0008, C21), and everything else goes through the link policy.                                               |
| 15  | `shell.openExternal` with untrusted URLs | Met    | Untrusted links pass `classifyLink`, which allows only `http(s)`, a checked `mailto:` and a digits-only `tel:`; every other call builds its URL from a constant.                                                            |
| 16  | Current Electron                         | Met    | Pinned to the latest stable release; Dependabot proposes updates weekly.                                                                                                                                                    |
| 17  | Validate IPC senders                     | Met    | Every chrome handler checks the sender's zone, frame origin and payload (`chrome/ipc.ts`); WhatsApp's notification and share messages check the account and origin. Plugins have no IPC, only one MessagePort.              |
| 18  | Custom protocols, not `file://`          | Met    | `app://` and per-plugin `plugin://`, both refusing paths outside their folder; the file-protocol fuse is off.                                                                                                               |
| 19  | Fuses                                    | Met    | `RunAsNode`, `NODE_OPTIONS` and the inspector are off; cookie encryption, ASAR integrity and ASAR-only loading are on. `verify-fuses.ts` checks every package in CI.                                                        |
| 20  | No Electron APIs for web content         | Met    | Bridges wrap fixed channels and never pass the IPC event; the plugin preload forwards only a port. `e2e/malicious-plugin.spec.ts` shows a hostile plugin reaches no such API.                                               |

## Plugin threat model

ADR 0004 assumes a plugin may be fully hostile. Each thing it must not do:

| A plugin must not                | What stops it                                                                                                                                                                               | Proof                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Read anything it was not granted | Every call is checked against the grants for the account on screen; chat and draft text only come through `chat:read-active` and `composer:read-draft`, capped and never logged (C26, C28). | `plugins.spec.ts`, `host-methods.test.ts`, `grants.test.ts`             |
| Send messages                    | No operation sends; drafts are typed into the composer for the user to send.                                                                                                                | `malicious-plugin.spec.ts` (`sendApi`, `sendViaPort`)                   |
| Reach hosts it did not declare   | The plugin CSP and the network filter allow only approved HTTPS hosts, asking before a new one, and loopback only with `local-network` (C29).                                               | `network-policy.test.ts`, `malicious-plugin.spec.ts`, `plugins.spec.ts` |
| Read other plugins' data         | Each plugin has its own session and partition; secrets and storage are keyed by the ID YapYap knows, never one the plugin names.                                                            | `malicious-plugin.spec.ts`, `key-value-store.test.ts`                   |
| Pass for WhatsApp or YapYap      | Plugins draw nothing in the main window; menu items and window titles carry the plugin's name, set by YapYap (C25).                                                                         | `plugins.spec.ts`, `menu.test.ts`                                       |
| Exhaust the computer             | Calls are rate limited and time out; a renderer over its CPU or memory budget is restarted, then stopped.                                                                                   | `rpc.test.ts`, `resource-guard.test.ts`, `malicious-plugin.spec.ts`     |

## Findings

| #   | Finding                                                                                              | Disposition                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | The screen-share "ended" message skipped the sender check that "started" makes.                      | Fixed: both now hear only WhatsApp's own page of an account (`capture/shares.ts`).                         |
| 2   | The plugin CSP lacked `base-uri`, `form-action` and `frame-ancestors`, which YapYap's own pages set. | Fixed: all three are `'none'`.                                                                             |
| 3   | Packaged builds honour `YAPYAP_TEST_WHATSAPP_ORIGIN`.                                                | Accepted: loopback HTTP only, logged when used, and environment variables are trusted (C2).                |
| 4   | Subframes may navigate anywhere.                                                                     | Accepted: WhatsApp plays link previews in third-party iframes; the sandbox and its CSP confine them (C14). |
| 5   | With `composer:insert-draft`, a plugin may replace the user's draft, not only add to it.             | Accepted: the grant is to write drafts, which the user still reads before sending; documented in ADR 0004. |
