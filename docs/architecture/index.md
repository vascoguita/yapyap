# Architecture overview

YapYap is an Electron app split into trust zones that share nothing they do
not have to. The main process is the only trusted code that touches the
system; every web page runs in a sandboxed, context-isolated renderer with
no Node.js access, and talks to the main process only through narrow,
checked channels.

| Zone         | Runs                                                                | Trust                         |
| ------------ | ------------------------------------------------------------------- | ----------------------------- |
| Main process | App logic, settings, IPC validation, plugin host                    | Trusted                       |
| App chrome   | YapYap's own UI, served from a custom `app://` protocol             | Trusted code, untrusted input |
| WhatsApp     | One sandboxed renderer per account, with its own persistent session | Untrusted (remote)            |
| Plugins      | One hidden, sandboxed renderer per plugin                           | Untrusted (third party)       |

## Processes and trust zones

<figure class="diagram">
<svg viewBox="0 0 760 440" role="img" aria-labelledby="zones-title zones-desc">
<title id="zones-title">YapYap's processes and trust zones</title>
<desc id="zones-desc">The trusted main process sits between three kinds of sandboxed renderer: WhatsApp accounts, YapYap's own chrome and plugins. Each reaches the main process through its own checked channel. WhatsApp views reach only web.whatsapp.com, plugins reach only hosts they were allowed, and the main process alone asks GitHub for updates.</desc>
<defs>
<marker id="zones-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10 z"/></marker>
</defs>
<rect class="box untrusted" x="20" y="20" width="220" height="50" rx="8"/>
<text class="title" x="130" y="42" text-anchor="middle">web.whatsapp.com</text>
<text class="note" x="130" y="59" text-anchor="middle">the internet</text>
<rect class="box untrusted" x="270" y="20" width="220" height="50" rx="8"/>
<text class="title" x="380" y="42" text-anchor="middle">GitHub releases</text>
<text class="note" x="380" y="59" text-anchor="middle">update metadata only</text>
<rect class="box untrusted" x="520" y="20" width="220" height="50" rx="8"/>
<text class="title" x="630" y="42" text-anchor="middle">Hosts a plugin may reach</text>
<text class="note" x="630" y="59" text-anchor="middle">approved HTTPS hosts, loopback</text>
<rect class="box trusted" x="140" y="130" width="480" height="80" rx="8"/>
<text class="title" x="380" y="158" text-anchor="middle">Main process (Node.js): trusted</text>
<text x="380" y="179" text-anchor="middle">settings · accounts · IPC checks · permissions · network filters</text>
<text x="380" y="197" text-anchor="middle">plugin host · capability checks · audit log · updates</text>
<rect class="box untrusted" x="20" y="290" width="220" height="130" rx="8"/>
<text class="title" x="130" y="314" text-anchor="middle">WhatsApp accounts</text>
<text x="130" y="336" text-anchor="middle">one view per account</text>
<text x="130" y="354" text-anchor="middle">persist:account-&lt;uuid&gt;</text>
<text x="130" y="372" text-anchor="middle">notification shim preload</text>
<text x="130" y="390" text-anchor="middle">adapter in an isolated world</text>
<text class="note" x="130" y="410" text-anchor="middle">untrusted, remote</text>
<rect class="box trusted" x="270" y="290" width="220" height="130" rx="8"/>
<text class="title" x="380" y="314" text-anchor="middle">App chrome</text>
<text x="380" y="336" text-anchor="middle">app://chrome/, in memory</text>
<text x="380" y="354" text-anchor="middle">sidebar, settings, dialogs</text>
<text x="380" y="372" text-anchor="middle">typed preload bridge</text>
<text x="380" y="390" text-anchor="middle">strict CSP, no remote code</text>
<text class="note" x="380" y="410" text-anchor="middle">trusted code, untrusted input</text>
<rect class="box untrusted" x="520" y="290" width="220" height="130" rx="8"/>
<text class="title" x="630" y="314" text-anchor="middle">Plugins</text>
<text x="630" y="336" text-anchor="middle">one hidden page each</text>
<text x="630" y="354" text-anchor="middle">plugin://&lt;id&gt;, own partition</text>
<text x="630" y="372" text-anchor="middle">panels: windows, no preload</text>
<text x="630" y="390" text-anchor="middle">CSP and network filter</text>
<text class="note" x="630" y="410" text-anchor="middle">untrusted, third party</text>
<path class="edge" d="M60,286 L60,74" marker-end="url(#zones-arrow)"/>
<text class="label" x="68" y="235">HTTPS</text>
<path class="edge" d="M700,286 L700,74" marker-end="url(#zones-arrow)"/>
<text class="label" x="692" y="235" text-anchor="end">filtered</text>
<path class="edge" d="M380,126 L380,74" marker-end="url(#zones-arrow)"/>
<path class="edge" d="M180,214 L180,286" marker-start="url(#zones-arrow)" marker-end="url(#zones-arrow)"/>
<text class="label" x="188" y="246">notification</text>
<text class="label" x="188" y="260">bridge, probes</text>
<path class="edge" d="M380,214 L380,286" marker-start="url(#zones-arrow)" marker-end="url(#zones-arrow)"/>
<text class="label" x="388" y="253">checked IPC</text>
<path class="edge" d="M580,214 L580,286" marker-start="url(#zones-arrow)" marker-end="url(#zones-arrow)"/>
<text class="label" x="588" y="246">one RPC port,</text>
<text class="label" x="588" y="260">checked calls</text>
</svg>
<figcaption>Solid outlines are trusted code; dashed outlines are untrusted content.</figcaption>
</figure>

- **WhatsApp** runs in one view per account inside the main window, each on
  its own persistent partition, so logins, storage and caches never cross
  accounts. The page reaches only WhatsApp's own origin: navigation and
  `window.open` guards send every other link to your browser. Its one
  preload replaces the page's `Notification` and has three operations,
  each checked by the main process ([ADR 0011](/adr/0011-whatsapp-notifications)).
  All knowledge of WhatsApp's page lives in the adapter
  (`src/adapter/`), whose scripts the main process runs in an isolated
  world on demand. They return plain flags or plain data, never page nodes,
  and they add no observers.
- **App chrome** is YapYap's own UI: the sidebar, Settings, the Plugins
  window and every other dialog. It is served from `app://chrome/` on an
  in-memory partition under a strict CSP. Its typed preload bridge can
  only invoke named operations, and the main process checks each call's
  sender and payload before acting.
- **Plugins** each run in a hidden, sandboxed page on a partition of their
  own, served only from `plugin://<id>/` under a CSP that allows no eval
  and no inline or remote code. A request leaves the page only to a host
  the user approved, or to this computer with `local-network`. A plugin's
  panel is a separate window with no preload; it reaches its plugin's page
  over a `BroadcastChannel`, never the main process
  ([ADR 0004](/adr/0004-plugin-isolation-and-trust-model)).
- **The main process** owns everything that touches the system: files,
  settings, secrets (through the system keychain), notifications, the tray,
  permissions and updates. It denies every permission by default
  ([ADR 0001](/adr/0001-process-model-and-security-boundaries)).

The [security review](/architecture/security-review) checks this design
against Electron's security checklist and a threat model for plugins.

## Data flows

### A WhatsApp notification

1. WhatsApp Web creates a `Notification`. The shim in the page's main world
   hands its title, body and tag to the preload, which forwards them.
2. The main process checks that the message came from a WhatsApp account
   view and that each field has the expected shape and size. Bad messages
   are dropped.
3. YapYap shows a native notification, named after the account when there
   are several, and redacted if Settings → Privacy says so. Nothing is
   logged or stored.
4. Clicking it brings YapYap forward, switches to the account and opens the
   chat. Reading the chat closes the notification.

### A plugin call

<figure class="diagram">
<svg viewBox="-2 0 764 190" role="img" aria-labelledby="rpc-title rpc-desc">
<title id="rpc-title">How YapYap checks a plugin's call</title>
<desc id="rpc-desc">A call from a plugin page crosses its port and is checked in order: the message envelope and parameters, the plugin's grant for the account on screen, and its rate. Only then does the host method run, with a timeout, reaching the adapter or the system and returning plain data. Each call's operation and outcome go to the audit log, never its parameters or result.</desc>
<defs>
<marker id="rpc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10 z"/></marker>
</defs>
<rect class="box untrusted" x="0" y="20" width="110" height="60" rx="8"/>
<text class="title" x="55" y="45" text-anchor="middle">Plugin page</text>
<text class="note" x="55" y="64" text-anchor="middle">calls the host API</text>
<rect class="box trusted" x="130" y="20" width="110" height="60" rx="8"/>
<text class="title" x="185" y="45" text-anchor="middle">Shape</text>
<text class="note" x="185" y="64" text-anchor="middle">envelope, params</text>
<rect class="box trusted" x="260" y="20" width="110" height="60" rx="8"/>
<text class="title" x="315" y="45" text-anchor="middle">Grant</text>
<text class="note" x="315" y="64" text-anchor="middle">for this account</text>
<rect class="box trusted" x="390" y="20" width="110" height="60" rx="8"/>
<text class="title" x="445" y="45" text-anchor="middle">Rate</text>
<text class="note" x="445" y="64" text-anchor="middle">5 a second, 20 burst</text>
<rect class="box trusted" x="520" y="20" width="110" height="60" rx="8"/>
<text class="title" x="575" y="45" text-anchor="middle">Host method</text>
<text class="note" x="575" y="64" text-anchor="middle">10 s timeout</text>
<rect class="box trusted" x="650" y="20" width="110" height="60" rx="8"/>
<text class="title" x="705" y="45" text-anchor="middle">Adapter, OS</text>
<text class="note" x="705" y="64" text-anchor="middle">plain data back</text>
<path class="edge" d="M112,50 L126,50" marker-end="url(#rpc-arrow)"/>
<path class="edge" d="M242,50 L256,50" marker-end="url(#rpc-arrow)"/>
<path class="edge" d="M372,50 L386,50" marker-end="url(#rpc-arrow)"/>
<path class="edge" d="M502,50 L516,50" marker-end="url(#rpc-arrow)"/>
<path class="edge" d="M632,50 L646,50" marker-end="url(#rpc-arrow)"/>
<rect class="box trusted" x="260" y="120" width="370" height="50" rx="8"/>
<text class="title" x="445" y="142" text-anchor="middle">Audit log</text>
<text class="note" x="445" y="160" text-anchor="middle">operation and outcome, never parameters or results</text>
<path class="edge" d="M445,84 L445,116" marker-end="url(#rpc-arrow)"/>
<text class="label" x="453" y="104">every call</text>
</svg>
<figcaption>Any failed check ends the call with a typed error, which the audit log records too.</figcaption>
</figure>

A plugin never names its own identity: the main process knows which port a
call came from, so a plugin's storage and secrets are always its own. There
is no operation that sends a message; a plugin can only put a draft in the
message box for you to send.

### An AI assistant reply

1. You open the assistant's panel and ask for replies. The panel asks the
   plugin's page over its `BroadcastChannel`.
2. The page reads the open chat through `chat:read-active`, which needs your
   grant for that account and returns at most the number of messages you
   set.
3. The panel shows exactly what will be sent and asks before the first
   request for each chat.
4. The page sends it to the provider you chose, with your API key from the
   system keychain, only to a host you approved, or only to this computer
   in local-only mode.
5. You pick a reply, and the page inserts it as a draft through
   `composer:insert-draft`. You read it and send it yourself.

See the [AI assistant guide](/guide/ai-assistant) for the settings and
the [privacy page](/privacy) for everything YapYap keeps on disk.

## Decisions

Each design choice is recorded in an
[Architecture Decision Record](/adr/):

| Topic                                                  | ADR                                                     |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Processes, trust zones, web preferences, permissions   | [0001](/adr/0001-process-model-and-security-boundaries) |
| Toolchain and pinned versions                          | [0002](/adr/0002-toolchain-and-resolved-versions)       |
| Package formats and update channels                    | [0003](/adr/0003-packaging-and-update-channels)         |
| Plugin isolation, signatures, capabilities, audit log  | [0004](/adr/0004-plugin-isolation-and-trust-model)      |
| Tests, coverage and mutation testing                   | [0005](/adr/0005-test-strategy)                         |
| Settings schema and migrations                         | [0006](/adr/0006-settings-schema-and-migrations)        |
| Branches, commits and merging                          | [0007](/adr/0007-git-and-merge-strategy)                |
| Requirements that conflicted, and how each was settled | [0008](/adr/0008-requirement-conflicts)                 |
| Memory, CPU and startup budgets                        | [0009](/adr/0009-performance-budgets)                   |
| Static analysis                                        | [0010](/adr/0010-static-analysis-with-sonarqube-cloud)  |
| WhatsApp notifications                                 | [0011](/adr/0011-whatsapp-notifications)                |
