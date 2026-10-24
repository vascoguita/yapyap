# Writing a plugin

A YapYap plugin is a small ES module, plus a manifest that says what it
needs. YapYap runs it in a sandbox of its own, away from WhatsApp, and
gives it only the capabilities you approve. This guide walks through the
example plugin in
[`plugins/example`](https://github.com/vascoguita/yapyap/tree/master/plugins/example).
It drafts a greeting in the open chat when you run its command, and lets you
choose the greeting in its settings.

## What a plugin is made of

```text
greeter/
├── manifest.json   who made it, what it needs, what it adds
└── main.js         the entry module YapYap starts
```

A plugin can carry more files, such as other modules its entry imports or
images. Every file is covered by the signature, and YapYap serves only files
inside the plugin.

## The manifest

```json
{
  "id": "org.example.greeter",
  "name": "Greeter",
  "version": "1.0.0",
  "description": "Drafts a greeting in the open chat, for you to edit and send.",
  "author": { "name": "YapYap contributors", "url": "https://github.com/vascoguita/yapyap" },
  "apiVersion": "^1.0.0",
  "entry": "main.js",
  "capabilities": ["composer:insert-draft"],
  "network": { "hosts": [] },
  "contributes": {
    "commands": [{ "id": "draft-greeting", "title": "Draft a greeting" }],
    "settings": {
      "type": "object",
      "properties": {
        "greeting": {
          "type": "string",
          "title": "Greeting",
          "description": "What the draft says.",
          "maxLength": 200
        }
      }
    }
  }
}
```

Ask for as little as you can: the user sees every capability and host
before installing, and can take any of them back later. The
[manifest reference](./manifest) lists every field, every capability and
the settings form YapYap renders. IDs under `org.guita.yapyap.` belong to
YapYap's own plugins, so pick a reverse-DNS name you control.

## The code

The `@yapyap/plugin-sdk` package has the types. A plugin needs only its
types at build time, so nothing from the SDK ends up in `main.js`:

```ts
import type { Plugin } from '@yapyap/plugin-sdk';

const FALLBACK = 'Hello! How are you?';

export default {
  activate(host) {
    host.commands.onRun('draft-greeting', async () => {
      const { greeting } = await host.settings.get();
      await host.composer.insertDraft(typeof greeting === 'string' ? greeting : FALLBACK);
    });
  },
} satisfies Plugin;
```

YapYap imports the `entry` module and calls the `activate` of its default
export with the host API. `host.commands.onRun` runs a handler when the
user picks the command from **Plugin Commands** in the menu, and
`host.settings.get` returns what the user saved in the plugin's form.
`host.composer.insertDraft` puts text in the open chat's message box: the
user reads it, edits it and sends it. No API sends a message.

Every host call returns a promise. A call that fails rejects with a
[`PluginError`](/api/interfaces/PluginError) whose `kind` says why:
`not-granted` (the user did not approve the capability, or took it back for
the account on screen), `invalid`, `rate-limited` (more than 20 calls in a
burst, refilling at 5 a second), `timeout` (10 seconds) or `failed`.

The [API reference](/api/) documents the whole host API. Of the chat
reading API, `host.chat.readActive()` is served: with `chat:read-active`,
it returns the open chat's name, whether it is a group, and the text of its
latest messages (as many as the user allows in Settings), or `null` when no
chat is open. `readUnreadSummary` is not served yet
([#100](https://github.com/vascoguita/yapyap/issues/100)), and its calls fail
with `invalid`.

### Keeping data

With `storage:local`, `host.storage` keeps JSON values under keys of up to
256 characters, private to the plugin and kept across restarts. A plugin's
store holds up to 1 MiB, and a write that would pass that fails. Values
must be plain JSON: a value JSON cannot hold, such as `undefined`, fails
the call.

### Reaching the internet

A plugin may call `fetch` on the HTTPS hosts its manifest lists under
`network.hosts`, and nothing else. When the user types an endpoint into a
setting, a request to a host not in the manifest asks the user first. Keep
API keys in `host.secrets`, which the operating system encrypts, never in
settings.

## Build it

The example compiles `src/main.ts` with `tsc` and copies the manifest next
to the output:

```sh
pnpm --filter @yapyap/plugin-example build   # writes plugins/example/dist/
```

Any bundler works, as long as the output is an ES module that runs in a
browser page without Node.js.

## Sign it

Plugins are signed with Ed25519. Make a key once, and keep it private and
backed up: YapYap pins it to your plugin ID on first install and refuses
updates signed by any other key.

```sh
openssl genpkey -algorithm ed25519 -out greeter-key.pem
```

Then sign the built folder and pack it into the archive users install:

```sh
node packages/plugin-sign/src/bin/yapyap-plugin-sign.ts sign --key greeter-key.pem plugins/example/dist
node packages/plugin-sign/src/bin/yapyap-plugin-sign.ts pack plugins/example/dist greeter.yapyap-plugin
```

`sign` writes the public key and the signature into `manifest.json`. The
signature covers the manifest and the SHA-256 of every file, so change
nothing after signing; `pack` refuses a folder whose signature no longer
verifies, and `verify` checks one by hand. The CLI never prints or writes
your private key.

## Try it

1. In YapYap, choose **Install Plugin…** from the menu and pick the
   `.yapyap-plugin` file.
2. Check the author, the key fingerprint, the capabilities and the hosts,
   tick the acknowledgement and choose **Install**.
3. Open **Plugins…** to set the greeting, take permissions back, or see
   the latest calls the plugin made.
4. Open a chat and choose **Plugin Commands → Greeter: Draft a greeting**.

While you work on a plugin, **Developer Mode** in Settings lets you install
it unsigned. YapYap marks unsigned plugins as such for as long as they are
installed, so turn Developer Mode off when you are done.

## Distribute it

Publish the `.yapyap-plugin` file wherever you like, such as your project's
releases, together with your key's fingerprint so users can check it in the
install window. YapYap does not review third-party plugins and says so when
the user installs one. To update, raise `version`, sign with the same key
and publish the new archive. An update that asks for new capabilities or
hosts waits until the user approves them.

## Threat model

YapYap assumes a plugin may be buggy, compromised or hostile, and holds the
line without trusting it ([ADR 0004](/adr/0004-plugin-isolation-and-trust-model)).
What that means for you as an author:

- **Isolation.** Each plugin runs in its own hidden, sandboxed page and
  browser session, with no Node.js and no access to WhatsApp's page or to
  other plugins. Its content security policy allows no `eval`, no inline
  scripts and no remote scripts.
- **One channel.** The plugin talks to YapYap only through the host API.
  Every call is validated, checked against the user's grants for the
  account on screen, rate limited and timed out, and written to an audit
  log the user can read. The log names the capability and the call, never
  the parameters or the result.
- **Least privilege.** The user can take any capability or host back at
  any time, for the whole plugin or for one account, and the next call
  fails with `not-granted`. Handle that gracefully.
- **Resources.** A plugin that keeps using more than half a CPU core or
  256 MB of memory is restarted, and stopped after three restarts in ten
  minutes.
- **Your key.** Whoever holds your private key can ship updates to your
  users. Keep it out of your repository, and use a CI secret if your CI
  signs releases.
- **Your users' data.** Chat text reaches a plugin only through capabilities
  the user granted. Do not send it anywhere the user would not expect, and
  say in your plugin's description which hosts it talks to and why.
