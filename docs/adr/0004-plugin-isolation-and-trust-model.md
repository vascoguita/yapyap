# 0004. Plugin isolation and trust model

- Status: Accepted
- Date: 2026-10-18

## Context

Plugins are third-party code running next to private conversations. A plugin
may be buggy, compromised, or malicious. The design must hold even if a plugin
is fully hostile: it must not read anything it was not granted, send messages,
reach undeclared hosts, read other plugins' data, impersonate WhatsApp's UI,
or exhaust the machine.

## Decision

### Package format

A plugin is a `.yapyap-plugin` zip containing `manifest.json`, an ESM entry
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
- Keys are Ed25519. The `plugin-sign` CLI takes a PKCS#8 PEM private key and
  never writes or prints private key material. The manifest carries the
  public key as base64 SPKI DER.
- The key **fingerprint** is the SHA-256 of the raw 32-byte public key, shown
  as colon-grouped hex.
- **First-party trust anchors** are an array of SPKI PEM public keys compiled
  into the app (`TRUST_ANCHORS` in `packages/plugin-sign/src/anchors.ts`).
  The first is the repository variable `PLUGIN_SIGNING_PUBLIC_KEY`, and CI
  fails if they differ. A first-party plugin, meaning any plugin ID under
  `org.guita.yapyap.`, must be signed by an anchor; nobody else can publish
  under that prefix. CI signs first-party plugins with the `PLUGIN_SIGNING_KEY` secret.
  To rotate the key, ship the new anchor in a release, sign with the new key
  from the next release, then remove the old anchor one release later
  (documented in CONTRIBUTING).
- **Third-party** plugins use trust on first use. At install, the user sees
  the author, the fingerprint, and every requested capability and network
  host. On consent, the key is pinned to the plugin ID (its fingerprint is
  stored with the plugin's grants in `<userData>/plugins/.plugins.json`). An update signed by a different key is
  rejected. `decideTrust` in `packages/plugin-sign` makes these decisions.
- Third-party plugins are fully supported, but YapYap does not review them.
  Their consent window says plainly that YapYap has not reviewed the plugin
  and that the user installs it at their own risk, and **Install** stays
  disabled until the user ticks an acknowledgement. The main process
  enforces this too: it refuses a third-party or unsigned install whose
  answer lacks the acknowledgement, whatever the page sends. The Plugins
  window keeps marking such plugins as "Third-party" or "Unsigned", so they
  never pass for YapYap's own.
- **URL installs** require a pinned `sha256-<base64>` integrity value next to
  the URL. A mismatch aborts before anything is unpacked.
- **Unsigned** plugins load only in Developer Mode (`plugins.developerMode`),
  with a persistent "Unsigned" badge in the chrome, and the Plugins window
  warns while Developer Mode is on. Developer Mode is never exported with
  the settings or changed by an import (ADR 0006), so a file someone hands
  the user cannot turn it on.
- An update that adds capabilities or hosts is staged and does not activate
  until the user re-approves.

### Unpacking

Archives are read in memory with fflate (`readPluginArchive` in
`packages/plugin-sign`). Limits: 20 MB archive, 512 entries, 10 MB per file
and 50 MB unpacked in total, checked against the declared sizes and again
against the bytes actually unpacked, since headers can lie. Entry names must be plain relative paths: absolute paths, drive letters,
backslashes, control characters, `.`, `..` and empty segments are rejected,
as are names that collide on case-insensitive file systems. Links are never
created: an entry stored as a link unpacks as an ordinary file holding its
target's name, which the signature covers. Files are written
to `<userData>/plugins/<id>/<version>/` only after the signature verifies.

### Runtime isolation

- Each enabled plugin runs in its own hidden `BrowserWindow` (never shown),
  with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`,
  `webviewTag: false`, and a partition `plugin:<id>` that is non-persistent
  unless the plugin holds `storage:local`, in which case it gets
  `persist:plugin:<id>`. Separate partitions are separate browser contexts,
  so plugins never share a renderer process, storage, cookies or cache with
  each other or with WhatsApp.
- Code is served only from `plugin://<id>/`, a privileged scheme registered
  **on that plugin's session only**. The handler serves files strictly inside
  the install directory and sets
  `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`.
  `eval`, inline scripts and remote scripts are therefore impossible.
- `webRequest.onBeforeRequest` on the plugin session cancels every request
  except `plugin://<id>/*` and `https://` hosts that are both declared and
  approved. Hosts the user enters at runtime (for example a custom AI
  endpoint) go through an explicit permission prompt before they join the
  allowlist.
  The plugin CSP adds `connect-src https:` so these requests reach the
  filter, which decides: only plain `https://` on the default port, without
  credentials, to a host name the manifest schema would accept. A new host
  raises one prompt at a time (Deny is the default); an allowed host is
  added to the plugin's record, and a refused one is not asked about again
  until YapYap restarts. A plugin that already holds 32 hosts is not asked
  about more.
- Plugin pages are a trust zone of their own (`plugin`). The navigation
  guard confines them: they open no windows and no links in the browser or
  other apps, and cannot navigate away from `plugin://<id>/`. The host page
  is generated by YapYap and only loads the manifest's `entry` as a module.
- **Single channel.** The preload does one thing: it receives a
  `MessagePort` from main and hands it to the page with `window.postMessage`.
  There is no `ipcRenderer` access.
- **RPC.** Messages are `{ id, method, params }`. In main, each message
  passes four checks in order, and a failure stops it:
  1. schema validation (TypeBox, interpreter mode)
  2. capability check against grants for (plugin, account)
  3. rate limit (token bucket per plugin)
  4. execution with a timeout

  Every call either returns a result or a typed error (`invalid`,
  `not-granted`, `rate-limited`, `timeout` or `failed`, with a short
  message that never carries the cause or the parameters). A message
  without a usable ID gets no reply. The bucket holds 20 calls and refills
  at 5 per second; a call times out after 10 seconds. Each page load gets a
  fresh port.

- **Bootstrap.** The host page loads YapYap's own script from
  `/__yapyap/host.js`, a path no plugin file can take. It takes the first
  port the preload hands over, builds the SDK's `PluginHost` on it (calls
  made before the port arrives wait for it), then imports the manifest's
  `entry` and calls its `activate`.

- **Resource limits.** `app.getAppMetrics()` samples each plugin's renderer
  PID. Sustained CPU or working-set overruns terminate the renderer. Three
  terminations within a window disable the plugin and notify the user.
  YapYap samples every 5 seconds; more than 50% CPU or 256 MB of working
  set in 3 samples in a row restarts the plugin, and a third restart within
  10 minutes stops it until YapYap restarts or the plugin is installed
  again.

### Capabilities

Capabilities are granted per plugin **and per account**, and can be revoked at
any time in settings.
At install the user approves the manifest's capabilities and hosts for the
whole plugin. The Plugins window can then take any of them back, and the
ones that act on the account on screen (`chat:read-active`,
`chat:read-unread-summary`, `composer:insert-draft`) account by account.
The record keeps these as `revoked` and `revokedIn`; an update keeps them,
and turning a grant back on can never give more than was approved. Grants
are read on every call and request, so a change applies to the next one.
YapYap listens on no port or socket, and a test fails if its code ever
starts to.

| Capability                 | Grants                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `chat:read-active`         | The active chat's metadata and its last N messages (N capped by the user), as plain data |
| `chat:read-unread-summary` | Unread counts and the last N unread messages per chat                                    |
| `composer:insert-draft`    | Insert text into the composer of the active chat. Never sends.                           |
| `notifications:show`       | Show a native notification attributed to the plugin                                      |
| `storage:local`            | A persistent private partition and a key-value store API                                 |
| `secrets:own`              | Read and write the plugin's own secrets namespace (Electron `safeStorage`)               |
| `network:<host>`           | HTTPS requests to that host via the plugin session                                       |

There is **no API to send a message**, and no capability that returns DOM
nodes, HTML, or arbitrary page script execution. All chat data comes from the
WhatsApp adapter as validated plain objects.

### UI contributions

Commands, composer actions, context-menu items and settings forms are
declarative. YapYap renders them in its own chrome, with the plugin's name and
icon in a visually distinct style, outside the WhatsApp view, so a plugin can
never draw over the composer or imitate WhatsApp. Optional panels render in
the plugin's own sandboxed view, inside a YapYap frame that shows the plugin
identity.

Commands are the first contribution YapYap renders (#98): those of the
running plugins appear in the menu under **Plugin Commands**, each labelled
`<plugin name>: <title>`. Picking one sends `{ command }` on the plugin's
port, and the bootstrap runs the handler the plugin registered with
`commands.onRun`; a handler that fails affects only itself. Only commands
the manifest declares can be sent.

### Audit log

Each capability use appends `{ time, pluginId, accountId, capability, method,
outcome }` to a local, rotating, user-visible log. Message content,
parameters and return values are never logged. The log is
`<userData>/plugins/audit.log`, one JSON line per call to an operation
YapYap offers (names a plugin makes up are never written, since they could
carry text), moved aside to `audit.log.1` past 256 KiB. The Plugins window
shows the latest 50 calls. `accountId` joins once grants are per account
(#94).

## Consequences

- Plugins cannot do anything outside these capabilities, by design. New needs
  require a new capability, an ADR, and a malicious-plugin test.
- Each enabled plugin costs one renderer process, and process count is part
  of the performance budget.
