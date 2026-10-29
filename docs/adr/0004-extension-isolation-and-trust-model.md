# 0004. Extension isolation and trust model

- Status: Accepted
- Date: 2026-10-18

## Context

Extensions are third-party code running next to private conversations. An extension
may be buggy, compromised, or malicious. The design must hold even if an extension
is fully hostile: it must not read anything it was not granted, send messages,
reach undeclared hosts, read other extensions' data, impersonate WhatsApp's UI,
or exhaust the machine.

## Decision

### Package format

An extension is a `.yapyap-extension` zip containing `manifest.json`, an ESM entry
point, and static assets. The manifest is validated against
`packages/sdk/schema/manifest.schema.json` (published with the SDK and on the
docs site). Fields: `id` (reverse-DNS), `name`, `version` (semver), `author`
(`name`, optional `url`), `apiVersion` (semver range against the SDK),
`entry`, `capabilities[]`, `network.hosts[]`, `contributes` (commands,
composer actions, context-menu items, settings JSON Schema, optional panel),
and `signature` (`publicKey`, `algorithm: "ed25519"`, `value`).

### Signing

- The **signed payload** is the canonical JSON (sorted keys, no whitespace)
  of `{ manifest without signature, files: [[path, sha256], ...] sorted by
path }`. Every file in the archive must appear in that list. Extra,
  missing or modified files fail verification.
- Keys are Ed25519. The `extension-sign` CLI takes a PKCS#8 PEM private key and
  never writes or prints private key material. The manifest carries the
  public key as base64 SPKI DER.
- The key **fingerprint** is the SHA-256 of the raw 32-byte public key, shown
  as colon-grouped hex.
- **First-party trust anchors** are an array of SPKI PEM public keys compiled
  into the app (`TRUST_ANCHORS` in `packages/extension-sign/src/anchors.ts`).
  The first is the repository variable `EXTENSION_SIGNING_PUBLIC_KEY`, and CI
  fails if they differ. A first-party extension, meaning any extension ID under
  `org.guita.yapyap.`, must be signed by an anchor; nobody else can publish
  under that prefix. CI signs first-party extensions with the `EXTENSION_SIGNING_KEY` secret.
  To rotate the key, ship the new anchor in a release, sign with the new key
  from the next release, then remove the old anchor one release later
  (documented in CONTRIBUTING).
- **Third-party** extensions use trust on first use. At install, the user sees
  the author, the fingerprint, and every requested capability and network
  host. On consent, the key is pinned to the extension ID (its fingerprint is
  stored with the extension's grants in `<userData>/extensions/.extensions.json`). An update signed by a different key is
  rejected. `decideTrust` in `packages/extension-sign` makes these decisions.
- Third-party extensions are fully supported, but YapYap does not review them.
  Their consent window says plainly that YapYap has not reviewed the extension
  and that the user installs it at their own risk, and **Install** stays
  disabled until the user ticks an acknowledgement. The main process
  enforces this too: it refuses a third-party or unsigned install whose
  answer lacks the acknowledgement, whatever the page sends. The Extensions
  window keeps marking such extensions as "Third-party" or "Unsigned", so they
  never pass for YapYap's own.
- **URL installs** require a pinned `sha256-<base64>` integrity value next to
  the URL. A mismatch aborts before anything is unpacked.
- **Marketplace installs** take the archive's SHA-256 and signer from the
  signed extension index (ADR 0014). Reviewed third-party extensions listed there
  skip the unreviewed-extension acknowledgement, since the maintainer reviewed
  that exact archive; the consent window still shows everything above.
- **Unsigned** extensions load only in Developer Mode (`extensions.developerMode`),
  with a persistent "Unsigned" badge in the chrome, and the Extensions window
  warns while Developer Mode is on. Developer Mode is never exported with
  the settings or changed by an import (ADR 0006), so a file someone hands
  the user cannot turn it on.
- An update that adds capabilities or hosts is staged and does not activate
  until the user re-approves.

### Unpacking

Archives are read in memory with fflate (`readExtensionArchive` in
`packages/extension-sign`). Limits: 20 MB archive, 512 entries, 10 MB per file
and 50 MB unpacked in total, checked against the declared sizes and again
against the bytes actually unpacked, since headers can lie. Entry names must be plain relative paths: absolute paths, drive letters,
backslashes, control characters, `.`, `..` and empty segments are rejected,
as are names that collide on case-insensitive file systems. Links are never
created: an entry stored as a link unpacks as an ordinary file holding its
target's name, which the signature covers. Files are written
to `<userData>/extensions/<id>/<version>/` only after the signature verifies.

### Runtime isolation

- Each enabled extension runs in its own hidden `BrowserWindow` (never shown),
  with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`,
  `webviewTag: false`, and a partition `extension:<id>` that is non-persistent
  unless the extension holds `storage:local`, in which case it gets
  `persist:extension:<id>`. Separate partitions are separate browser contexts,
  so extensions never share a renderer process, storage, cookies or cache with
  each other or with WhatsApp.
- Code is served only from `extension://<id>/`, a privileged scheme registered
  **on that extension's session only**. The handler serves files strictly inside
  the install directory and sets
  `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`.
  `eval`, inline scripts and remote scripts are therefore impossible.
- `webRequest.onBeforeRequest` on the extension session cancels every request
  except `extension://<id>/*` and `https://` hosts that are both declared and
  approved. Hosts the user enters at runtime (for example a custom AI
  endpoint) go through an explicit permission prompt before they join the
  allowlist.
  The extension CSP adds `connect-src https:` so these requests reach the
  filter, which decides: only plain `https://` on the default port, without
  credentials, to a host name the manifest schema would accept. A new host
  raises one prompt at a time (Deny is the default); an allowed host is
  added to the extension's record, and a refused one is not asked about again
  until YapYap restarts. An extension that already holds 32 hosts is not asked
  about more.
  The extension CSP also lets plain HTTP to `localhost`, `127.0.0.1` and
  `[::1]` reach the filter, which allows it, on any port, only to an extension
  holding `local-network` (#103), for a model server the user runs on
  this computer. Other machines on the local network are never reachable.
  Even with the grant, each server on this computer (host and port) is
  reachable only once the user approved it for the extension, through the
  same one-at-a-time prompt as a new host, with Deny the default; approvals
  are kept in the record (`localServers`, at most 8), and a refused server
  is not asked about again until YapYap restarts (#430). Local servers such
  as Ollama refuse a request whose `Origin` they do not list, and an
  extension's never is. So requests to an approved server leave the
  extension's session without an `Origin`, and the session answers CORS for
  them itself: the extension's own origin, any method and headers, and
  `204` for a preflight. That lifts the protection the server keeps against
  web pages, so it happens only for the one server the user chose; every
  other service on this computer stays unreachable.
- Extension pages are a trust zone of their own (`extension`). The navigation
  guard confines them: they open no windows and no links in the browser or
  other apps, and cannot navigate away from `extension://<id>/`. The host page
  is generated by YapYap and only loads the manifest's `entry` as a module.
- **Single channel.** The preload does one thing: it receives a
  `MessagePort` from main and hands it to the page with `window.postMessage`.
  There is no `ipcRenderer` access.
- **RPC.** Messages are `{ id, method, params }`. In main, each message
  passes four checks in order, and a failure stops it:
  1. schema validation (TypeBox, interpreter mode)
  2. capability check against grants for (extension, account)
  3. rate limit (token bucket per extension)
  4. execution with a timeout

  Every call either returns a result or a typed error (`invalid`,
  `not-granted`, `rate-limited`, `timeout` or `failed`, with a short
  message that never carries the cause or the parameters). A message
  without a usable ID gets no reply. The bucket holds 20 calls and refills
  at 5 per second; a call times out after 10 seconds. Each page load gets a
  fresh port.

- **Bootstrap.** The host page loads YapYap's own script from
  `/__yapyap/host.js`, a path no extension file can take. It takes the first
  port the preload hands over, builds the SDK's `ExtensionHost` on it (calls
  made before the port arrives wait for it), then imports the manifest's
  `entry` and calls its `activate`.

- **Resource limits.** `app.getAppMetrics()` samples each extension's renderer
  PID. Sustained CPU or working-set overruns terminate the renderer. Three
  terminations within a window disable the extension and notify the user.
  YapYap samples every 5 seconds; more than 50% CPU or 256 MB of working
  set in 3 samples in a row restarts the extension, and a third restart within
  10 minutes stops it until YapYap restarts or the extension is installed
  again.

### Capabilities

Capabilities are granted per extension **and per account**, and can be revoked at
any time in settings.
At install the user approves the manifest's capabilities and hosts for the
whole extension. The Extensions window can then take any of them back, and the
ones that act on the account on screen (`chat:read-active`,
`chat:read-unread-summary`, `composer:insert-draft`, `composer:read-draft`) account by account.
The record keeps these as `revoked` and `revokedIn`; an update keeps them,
and turning a grant back on can never give more than was approved. Grants
are read on every call and request, so a change applies to the next one.
YapYap listens on no port or socket, and a test fails if its code ever
starts to.

| Capability                 | Grants                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `chat:read-active`         | The active chat's metadata and its last N messages (N capped by the user), as plain data     |
| `chat:read-unread-summary` | Unread counts and the last N unread messages per chat                                        |
| `composer:insert-draft`    | Insert text into the composer of the active chat, or replace what is there. Never sends.     |
| `composer:read-draft`      | Read what the user typed so far in the active chat's composer, as plain text                 |
| `notifications:show`       | Show a native notification attributed to the extension                                       |
| `storage:local`            | A persistent private partition and a key-value store API                                     |
| `secrets:own`              | Read and write the extension's own secrets namespace (Electron `safeStorage`)                |
| `network:<host>`           | HTTPS requests to that host via the extension session                                        |
| `local-network`            | HTTP or HTTPS requests to this computer (`localhost`, `127.0.0.1`, `[::1]`), any port        |
| `assistant:bar`            | Plain-text suggestions in the bar beneath the chat; sent only on the user's click (ADR 0013) |

The key-value store (#301) keeps each extension's values as JSON in
`<userData>/extensions/.storage/<id>.json`, readable by the user alone, with
the ID taken from YapYap, never from the call. Keys are up to 256
characters, a store holds up to 1 MiB, and a write past that fails.

Removing an extension (#332), once the user confirms, stops it and closes its
panel, clears both partitions it may have had (an update can add or drop
`storage:local`), deletes its record and then its folder, and deletes its
key-value store and every secret under `<id>/`. Its audit log entries stay,
since they hold no parameters or results.

There is **no API to send a message**, and no capability that returns DOM
nodes, HTML, or arbitrary page script execution. All chat data comes from the
WhatsApp adapter as validated plain objects.

### UI contributions

Commands, composer actions, context-menu items and settings forms are
declarative. YapYap renders them in its own chrome, with the extension's name and
icon in a visually distinct style, outside the WhatsApp view, so an extension can
never draw over the composer or imitate WhatsApp. An optional panel opens
in a window of its own, on the extension's session and under its CSP, titled
with the extension's name by YapYap (C25 in ADR 0008).

Commands are the first contribution YapYap renders (#98): those of the
running extensions appear in the menu under **Extension Commands**, each labelled
`<extension name>: <title>`. Picking one sends `{ command }` on the extension's
port, and the bootstrap runs the handler the extension registered with
`commands.onRun`; a handler that fails affects only itself. Only commands
the manifest declares can be sent.

The settings form is the second (#98): YapYap renders only a plain object
of `string`, `number`, `integer` and `boolean` fields with titles,
descriptions, choices and bounds, so an extension cannot shape YapYap's window
beyond labels and simple inputs. Values are checked against the form when
saved and again when the extension reads them with `settings.get`, which needs
no capability because the user filled them in for that extension.

Composer actions and context-menu items are the third (#98). They join
YapYap's native right-click menu in WhatsApp, after YapYap's own items,
labelled `<extension name>: <title>`: composer actions on the message box,
`message` items on the open conversation, `chat` items on the chat list.
To tell these apart, the adapter checks which landmark holds the clicked
point and returns only that, never page text, and only when some extension
has items. Picking one runs the extension's command, as the menu does; the
extension then reads what its capabilities allow. Where WhatsApp shows a menu
of its own, Chromium shows none, and so neither do extension items.

Panels are the last (#98). **Extension Commands** lists each running extension's
panel after its commands. Picking one opens the panel's window, or brings
it forward. YapYap serves its page at `/__yapyap/panel.html`, which links
YapYap's panel style (`/__yapyap/panel.css`, #396) and loads the
manifest's `panel.entry` as a module. The window has no preload, so the
panel gets no port; it reaches the host API only through its extension's
hidden page, which shares its origin. The window's title is
`<extension name>: <panel title>`, and the page cannot change it. The panel
closes when its extension stops or restarts.

### Audit log

Each capability use appends `{ time, extensionId, accountId, capability, method,
outcome }` to a local, rotating, user-visible log. Message content,
parameters and return values are never logged. The log is
`<userData>/extensions/audit.log`, one JSON line per call to an operation
YapYap offers (names an extension makes up are never written, since they could
carry text), moved aside to `audit.log.1` past 256 KiB. The Extensions window
shows the latest 50 calls. `accountId` joins once grants are per account
(#94).

## Consequences

- Extensions cannot do anything outside these capabilities, by design. New needs
  require a new capability, an ADR, and a malicious-extension test.
- Each enabled extension costs one renderer process, and process count is part
  of the performance budget.
