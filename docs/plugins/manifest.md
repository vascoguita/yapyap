# Plugin manifest

Every plugin carries a `manifest.json` that says who made it, what it needs
and what it adds to YapYap. YapYap checks it against the
[manifest schema](/schema/manifest.schema.json) before it shows the plugin
to you, and shows you every capability and host it asks for before you
install it. Plugins are still being built (milestone M5); this page
describes the format they will use.

```json
{
  "$schema": "https://yapyap.guita.org/schema/manifest.schema.json",
  "id": "org.example.translate",
  "name": "Translate",
  "version": "1.2.0",
  "author": { "name": "Example", "url": "https://example.org" },
  "apiVersion": "^1.0.0",
  "entry": "dist/main.js",
  "capabilities": ["chat:read-active", "composer:insert-draft"],
  "network": { "hosts": ["api.example.org"] },
  "contributes": {
    "commands": [{ "id": "translate", "title": "Translate draft" }],
    "composerActions": [{ "title": "Translate", "command": "translate" }]
  }
}
```

| Field          | Meaning                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `id`           | Reverse-DNS name, lower case, such as `org.example.translate`                                 |
| `version`      | Semantic version of the plugin                                                                |
| `apiVersion`   | The SDK versions it works with: an exact version, or one starting with `^` or `~`             |
| `entry`        | The ES module YapYap starts, a path inside the plugin                                         |
| `capabilities` | What it may do; see below. YapYap asks you for each one, per account                          |
| `network`      | The only HTTPS hosts it may reach: names, without a scheme or port                            |
| `contributes`  | Commands, composer actions, context-menu items, a settings form and an optional panel         |
| `signature`    | Written by `yapyap-plugin-sign`: the author's Ed25519 public key and the signature (ADR 0004) |

## Capabilities

| Capability                 | Lets the plugin                                              |
| -------------------------- | ------------------------------------------------------------ |
| `chat:read-active`         | Read the open chat's name and its most recent messages       |
| `chat:read-unread-summary` | Read unread counts and the latest unread messages per chat   |
| `composer:insert-draft`    | Put text in the composer for you to edit and send            |
| `notifications:show`       | Show notifications with its name                             |
| `storage:local`            | Keep its own data between sessions                           |
| `secrets:own`              | Keep its own secrets, such as API keys, encrypted by your OS |

No capability lets a plugin send a message, see WhatsApp's page, or run code
in it. Plugins only ever get chat content as plain data, and only what you
grant.

## Settings form

`contributes.settings` is a JSON Schema for the plugin's settings, which
YapYap shows as a form in the Plugins window. YapYap renders only a plain
`object` whose `properties` are named with letters, digits and `_` and
each have:

- `type`: `string`, `number`, `integer` or `boolean`;
- optionally `title`, `description`, `enum` (the choices),
  `minimum`/`maximum`, and `maxLength` (at most 1000).

A schema with anything else shows no form. The plugin reads what the user
saved with `host.settings.get()`, which needs no capability; a setting the
user never saved is missing, so the plugin falls back to its own default.
Keep API keys out of settings and in `host.secrets`.

## Writing a plugin

The `@yapyap/plugin-sdk` package has the TypeScript types for the manifest
and for the host API a plugin receives:

```ts
import { definePlugin } from '@yapyap/plugin-sdk';

export default definePlugin({
  activate(host) {
    host.commands.onRun('translate', async () => {
      const chat = await host.chat.readActive();
      if (chat !== null) {
        await host.composer.insertDraft(`Hello, ${chat.name}!`);
      }
    });
  },
});
```
