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
  host. On consent, the key is pinned to the plugin ID (a `plugin-pins.json`
  of IDs and key fingerprints). An update signed by a different key is
  rejected. `decideTrust` in `packages/plugin-sign` makes these decisions.
- **URL installs** require a pinned `sha256-<base64>` integrity value next to
  the URL. A mismatch aborts before anything is unpacked.
- **Unsigned** plugins load only in Developer Mode, with a persistent
  "Unsigned" badge in the chrome.
- An update that adds capabilities or hosts is staged and does not activate
  until the user re-approves.

### Unpacking

Archives are read in memory with fflate. Size and entry-count limits are
enforced. Entry names are normalized, and any absolute path, `..` segment,
symlink, or path that escapes the install root is rejected. Files are written
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
- **Single channel.** The preload does one thing: it receives a
  `MessagePort` from main and hands it to the page with `window.postMessage`.
  There is no `ipcRenderer` access.
- **RPC.** Messages are `{ id, method, params }`. In main, each message
  passes four checks in order, and a failure stops it:
  1. schema validation (TypeBox, interpreter mode)
  2. capability check against grants for (plugin, account)
  3. rate limit (token bucket per plugin)
  4. execution with a timeout

  Every call either returns a result or a typed error.

- **Resource limits.** `app.getAppMetrics()` samples each plugin's renderer
  PID. Sustained CPU or working-set overruns terminate the renderer. Three
  terminations within a window disable the plugin and notify the user.

### Capabilities

Capabilities are granted per plugin **and per account**, and can be revoked at
any time in settings.

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

### Audit log

Each capability use appends `{ time, pluginId, accountId, capability, method,
outcome }` to a local, rotating, user-visible log. Message content,
parameters and return values are never logged.

## Consequences

- Plugins cannot do anything outside these capabilities, by design. New needs
  require a new capability, an ADR, and a malicious-plugin test.
- Each enabled plugin costs one renderer process, and process count is part
  of the performance budget.
