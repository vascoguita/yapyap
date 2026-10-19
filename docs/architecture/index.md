# Architecture overview

YapYap is an Electron app organized into strictly separated trust zones:

| Zone         | Runs                                                                | Trust                         |
| ------------ | ------------------------------------------------------------------- | ----------------------------- |
| Main process | App logic, settings, IPC validation, plugin host                    | Trusted                       |
| App chrome   | YapYap's own UI, served from a custom `app://` protocol             | Trusted code, untrusted input |
| WhatsApp     | One sandboxed renderer per account, with its own persistent session | Untrusted (remote)            |
| Plugins      | One hidden, sandboxed renderer per enabled plugin                   | Untrusted (third party)       |

Every renderer is sandboxed and context-isolated, and none has Node.js
access. All WhatsApp-specific DOM knowledge lives in a single adapter module,
so a change in WhatsApp's UI is a one-file fix.

The reasoning behind each decision is recorded in the
[Architecture Decision Records](/adr/).
