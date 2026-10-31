# Writing an extension

A YapYap extension is a small ES module, plus a manifest that says what it
needs. YapYap runs it in a sandbox of its own, away from WhatsApp, and
gives it only the capabilities you approve. This guide walks through the
example extension in
[`extensions/example`](https://github.com/vascoguita/yapyap/tree/master/extensions/example).
It drafts a greeting in the open chat when you run its command, and lets you
choose the greeting in its settings.

## What an extension is made of

```text
greeter/
├── manifest.json   who made it, what it needs, what it adds
└── main.js         the entry module YapYap starts
```

An extension can carry more files, such as other modules its entry imports or
images. Every file is covered by the signature, and YapYap serves only files
inside the extension.

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
YapYap's own extensions, so pick a reverse-DNS name you control.

## The code

The `@yapyap/extension-sdk` package has the types. An extension needs only its
types at build time, so nothing from the SDK ends up in `main.js`:

```ts
import type { Extension } from '@yapyap/extension-sdk';

const FALLBACK = 'Hello! How are you?';

export default {
  activate(host) {
    host.commands.onRun('draft-greeting', async () => {
      const { greeting } = await host.settings.get();
      await host.composer.insertDraft(typeof greeting === 'string' ? greeting : FALLBACK);
    });
  },
} satisfies Extension;
```

YapYap imports the `entry` module and calls the `activate` of its default
export with the host API. `host.commands.onRun` runs a handler when the
user picks the command from **Extension Commands** in the menu, and
`host.settings.get` returns what the user saved in the extension's form.
`host.composer.insertDraft` puts text in the open chat's message box: the
user reads it, edits it and sends it. No API sends a message.

Every host call returns a promise. A call that fails rejects with a
[`ExtensionError`](/api/interfaces/ExtensionError) whose `kind` says why:
`not-granted` (the user did not approve the capability, or took it back for
the account on screen), `invalid`, `rate-limited` (more than 40 calls in a
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
256 characters, private to the extension and kept across restarts. An extension's
store holds up to 1 MiB, and a write that would pass that fails. Values
must be plain JSON: a value JSON cannot hold, such as `undefined`, fails
the call.

When the user removes the extension in the Extensions window, YapYap deletes its
store, its secrets and its browser data (such as `localStorage`) along with
its files. Installed again, it starts from nothing, so treat anything it
kept as something the user can take away at any time.

### Reaching the internet

An extension may call `fetch` on the HTTPS hosts its manifest lists under
`network.hosts`, and, with `local-network`, on servers running on the
user's computer (`localhost`, `127.0.0.1` or `[::1]`, any port) the user
allows, and nothing else. When the user types an endpoint into a
setting, a request to a host not in the manifest asks the user first, and
so does the first request to each server on the user's computer. YapYap
answers CORS for a local server the user allowed, so it needs no
`Access-Control-Allow-Origin` setup of its own. Keep
API keys in `host.secrets`, which the operating system encrypts, never in
settings.

### Finding models on the user's computer

With `local-network`, `host.localModels.find()` returns the AI model
servers running on the user's computer, so the user need not type an
address. YapYap looks, not the extension: it asks the usual addresses of
Ollama (port 11434), Alpaca (11435), LM Studio (1234) and llama.cpp (8080)
for their lists of models, and returns up to four servers, each with its
`server` (such as `localhost:11434`), its OpenAI-compatible `endpoint`
(such as `http://localhost:11434/v1`) and up to 20 model IDs:

```ts
const [server] = (await host.localModels.find()).filter(({ models }) => models.length > 0);
```

The first call asks the user whether the extension may look, and the call
waits up to two minutes for the answer. YapYap remembers it: after a
refusal, every call rejects with `not-granted` until the user turns
`local-network` off and on again. Call it only when the user asks, such as
from a **Find a model** button. A YapYap older than this API rejects the
call with `invalid`. Finding a server does not let the extension use it:
its first request there still asks the user, as above.

### The assistant bar

With `assistant:bar`, an extension fills the bar YapYap draws above the open
chat's message box ([ADR 0013](/adr/0013-in-chat-assistant-bar)). `host.assistant.onRequest`
runs a handler for each thing the user does in the bar: `suggest`,
`prompt` with the text the user typed, `confirm` when the user clicks
the button the extension offered, or `choose` with the option the user
picked in its choice. `host.assistant.offer` replaces what the bar
shows: up to five suggestions of at most 1,000 characters, a status line
of at most 200, an optional `confirm` label of at most 40, such as
"Allow here", and an optional `choice`, such as the model in use: a
label of at most 40 characters, the current value, and up to 20 options,
each a value of at most 100 characters and a label of at most 60. The
bar keeps the last choice until another comes, passes on only an option
the extension offered, and asks for suggestions again after a pick if
some were showing.

```ts
host.assistant.onRequest(async (request) => {
  if (request.type === 'suggest') {
    await host.assistant.offer({ suggestions: ['On my way!', 'Running late, sorry'] });
  }
});
```

Everything the bar shows is plain text under the extension's name, drawn by
YapYap. The user puts a suggestion in the message box, or sends it, with a
click. The extension never sends: YapYap does, after checking that the chat
the suggestion was asked for is still the one open. Only the first running
extension holding the grant for the account on screen fills the bar.

### Styling a panel

A panel starts with YapYap's own look: system fonts, YapYap's colors in
light and dark, styled buttons, inputs and lists, and a visible focus ring.
YapYap links this stylesheet before your panel's module, so plain HTML
already fits in. Give the button for the step a person takes next the
`yapyap-primary` class.

To style more, ship a stylesheet in your extension and add it from your
panel's module with a `<link rel="stylesheet">` to its path: the extension
CSP allows your own files, never inline styles. Build on these variables,
which follow the theme:

| Variable                                | What it is                          |
| --------------------------------------- | ----------------------------------- |
| `--yapyap-surface`, `--yapyap-raised`   | The page background, and cards      |
| `--yapyap-text`, `--yapyap-muted`       | Text, and secondary text            |
| `--yapyap-accent`, `--yapyap-on-accent` | Accent color, and text on it        |
| `--yapyap-border`, `--yapyap-danger`    | Borders, and errors                 |
| `--yapyap-radius`                       | Corner radius of cards and messages |

## Build it

The example compiles `src/main.ts` with `tsc` and copies the manifest next
to the output:

```sh
pnpm --filter @yapyap/extension-example build   # writes extensions/example/dist/
```

Any bundler works, as long as the output is an ES module that runs in a
browser page without Node.js.

## Sign it

Extensions are signed with Ed25519. Make a key once, and keep it private and
backed up: YapYap pins it to your extension ID on first install and refuses
updates signed by any other key.

```sh
openssl genpkey -algorithm ed25519 -out greeter-key.pem
```

Then sign the built folder and pack it into the archive users install:

```sh
node packages/extension-sign/src/bin/yapyap-extension-sign.ts sign --key greeter-key.pem extensions/example/dist
node packages/extension-sign/src/bin/yapyap-extension-sign.ts pack extensions/example/dist greeter.yapyap-extension
```

`sign` writes the public key and the signature into `manifest.json`. The
signature covers the manifest and the SHA-256 of every file, so change
nothing after signing; `pack` refuses a folder whose signature no longer
verifies, and `verify` checks one by hand. The CLI never prints or writes
your private key.

## Try it

1. In YapYap, choose **Install Extension…** from the menu and pick the
   `.yapyap-extension` file.
2. Check the author, the key fingerprint, the capabilities and the hosts,
   tick the acknowledgement and choose **Install**.
3. Open **Extensions…** to set the greeting, take permissions back, or see
   the latest calls the extension made.
4. Open a chat and choose **Extension Commands → Greeter: Draft a greeting**.

While you work on an extension, **Developer Mode** in Settings lets you install
it unsigned. YapYap marks unsigned extensions as such for as long as they are
installed, so turn Developer Mode off when you are done.

## Distribute it

Publish the `.yapyap-extension` file wherever you like, such as your project's
releases, together with your key's fingerprint so users can check it in the
install window. YapYap does not review third-party extensions and says so when
the user installs one. To update, raise `version`, sign with the same key
and publish the new archive. An update that asks for new capabilities or
hosts waits until the user approves them.

## Threat model

YapYap assumes an extension may be buggy, compromised or hostile, and holds the
line without trusting it ([ADR 0004](/adr/0004-extension-isolation-and-trust-model)).
What that means for you as an author:

- **Isolation.** Each extension runs in its own hidden, sandboxed page and
  browser session, with no Node.js and no access to WhatsApp's page or to
  other extensions. Its content security policy allows no `eval`, no inline
  scripts and no remote scripts.
- **One channel.** The extension talks to YapYap only through the host API.
  Every call is validated, checked against the user's grants for the
  account on screen, rate limited and timed out, and written to an audit
  log the user can read. The log names the capability and the call, never
  the parameters or the result.
- **Least privilege.** The user can take any capability or host back at
  any time, for the whole extension or for one account, and the next call
  fails with `not-granted`. Handle that gracefully.
- **Resources.** An extension that keeps using more than half a CPU core or
  256 MB of memory is restarted, and stopped after three restarts in ten
  minutes.
- **Your key.** Whoever holds your private key can ship updates to your
  users. Keep it out of your repository, and use a CI secret if your CI
  signs releases.
- **Your users' data.** Chat text reaches an extension only through capabilities
  the user granted. Do not send it anywhere the user would not expect, and
  say in your extension's description which hosts it talks to and why.
