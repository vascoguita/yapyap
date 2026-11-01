# 0017. The assistant is part of YapYap

- Status: Accepted
- Date: 2026-11-01

## Context

The AI assistant (#103) shipped as YapYap's own extension. Setting it up
was scattered: a marketplace install, capability grants, an extension
panel window, the extension's settings form, the in-chat bar, a separate
consent for each chat, and a separate flow for the private model. People
who are not technical found it hard to know where to start, and the
maintainer chose to make the assistant YapYap's main feature
(2026-11-01).

Being an extension also bent the extension model out of shape. The
assistant needed a surface no other extension used:

- `assistant:bar` and `host.assistant.offer`, so an extension could fill
  a bar inside WhatsApp's page (ADR 0013).
- `local-model`, with its own CSP (`'wasm-unsafe-eval'`, `blob:`
  workers, `connect-src 'self'`), cross-origin isolation, a memory limit
  of up to 4 GiB and no CPU limit (C38).
- `localModels.find`, with its own prompt and a stored answer (C37).
- The official SDKs' `dangerouslyAllowBrowser` flag, to call providers
  from a web page (C27).

Every one of these was an exception to ADR 0004 that any future extension
could ask for too.

## Decision

1. **The assistant is YapYap's own code.** It lives in
   `apps/desktop/src/main/assistant/`: the setup and the provider in use,
   the actions (suggest replies, write a described message, summarize,
   rewrite, catch up on unread chats, suggest as messages arrive), the
   keys, the chats it may read, the model lists and Auto, finding model
   servers on this computer, and the private model.
2. **Providers run in the main process, confined.** Claude and OpenAI go
   through their official SDKs (`@anthropic-ai/sdk`, `openai`), without
   `dangerouslyAllowBrowser`. Their `fetch` is built on `session.fetch`
   of an in-memory session of its own, `yapyap-assistant`, so system
   proxies apply and no cookie or cache is kept. It refuses, before
   anything is sent, every address but `api.anthropic.com`,
   `api.openai.com`, `huggingface.co` and `*.hf.co` over HTTPS, and the
   one model server on this computer the user chose (`net.ts`). A
   `webRequest` guard on the same session cancels anything else,
   redirects included. What a model writes is plain text, shown only as
   text.
3. **Chat access stays as it was.** The assistant reads the open chat and
   the chat list's unread summary through the adapter's readers (C26,
   C39), reads and writes the draft through the composer, and never sends
   a message: it puts drafts in the message box. Only the user's click on
   a suggestion's **Send** sends it, after YapYap checks the same chat is
   still open (ADR 0013).
4. **Settings and state.** Settings version 19 adds an `assistant`
   section: on or off, the provider (`auto`, `built-in`, `anthropic`,
   `openai` or `local`), the model (`auto` or an ID), suggesting replies
   as messages arrive (moved from `extensions.autoSuggest`), how many
   messages it reads, and the model server's address, which only a
   loopback `/v1` address can be. The section is local, like
   `extensions`: an export leaves it out and an import keeps it as it is,
   so a file someone hands the user cannot point the assistant elsewhere.
   API keys go to YapYap's secrets, encrypted by the system through
   `safeStorage`, under `assistant/key/<provider>`. What is no preference
   lives in state files: `assistant.json` holds the private model chosen
   and whether it is ready, and a one-time note; `assistant-chats.json`
   holds, per account, the SHA-256 of the name of each chat the user
   allowed. The names themselves, for Settings' list, are kept only
   encrypted, in the secrets, under `assistant/chat/<account>/<id>` (C42).
5. **The private model.** The main process downloads it on the user's
   click into `<userData>/models/`, as `<sha256>.gguf.part` while it
   downloads and `<sha256>.gguf` once its SHA-256, hashed with
   `node:crypto` as it streams in, matches the pinned one. It resumes
   with an HTTP `Range`, checks the free space first, and stops as "disk
   full" on `ENOSPC`. The catalog stays pinned to commits: Qwen2.5 1.5B,
   or 0.5B for a computer with too little memory or fewer than four cores.
6. **The engine runs in a window of its own.** wllama runs in a hidden
   window made with `createSecureWindow`: sandboxed, context-isolated, on
   the in-memory `yapyap-engine` partition, on `app://engine`. That
   origin serves only the engine page, its script, `wllama.wasm` and the
   downloaded model at `model.gguf` (with `Range`), under its own CSP
   (`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`,
   `connect-src 'self'`) with COOP, COEP and CORP, so it gets threads and
   reaches no network. Its preload exposes two fixed channels: commands
   in (load, complete, cancel) and events out (text, done, failed). The
   main process believes an event only from the engine window, on its
   origin, in the expected shape. The window opens on first use, never
   at startup, and closes after five minutes without a request. The
   `app` scheme gained `supportFetchAPI` for this; chrome pages keep
   `connect-src 'none'`.
7. **One place to set it up, one place to use it.** Settings › Assistant
   is the first section: where the assistant thinks (Automatic, the
   private model, Claude, OpenAI or a model server on this computer),
   the model, its behaviour, and what it may read. The Welcome offers a
   model server it finds, the private model, a key, or later. The bar
   above the message box holds the actions (Suggest replies, Summarize,
   Rewrite in a style or into one of the system's languages, Catch up),
   the model, a gear for Settings, and a result area with Copy, Use and
   Close. It asks before it reads a chat for the first time, with **What
   is sent?** to see the exact text first. Catching up shows exactly what
   is sent and needs **Send** each time (C41). Setup problems come with a
   one-click fix. An Assistant menu holds the actions, with shortcuts
   Ctrl+Shift+Y, Ctrl+Shift+L and Ctrl+Shift+U (⌘ on macOS). The panel
   window is gone.
8. **The extension goes.** On start, if the `org.guita.yapyap.ai-assistant`
   extension is installed, YapYap takes over its provider, model,
   message count, API keys and allowed chats, uninstalls it with its
   storage, secrets and session, and the bar shows a one-time note. Its
   private model lived in its own storage, so the note asks to download
   it again. The extension API loses `assistant:bar`, `assistant.offer`,
   `local-model`, `localModels.find`, the test-model hook and the
   extension scheme's fetch support.

## Consequences

- One coherent setup for the assistant, in YapYap's own windows, and no
  marketplace install.
- The extension model is back to what ADR 0004 meant: no capability lets
  an extension run code with WebAssembly, draw in WhatsApp's page or skip
  the resource limits.
- The main process now makes network requests and runs a model (C43).
  Both stay confined: the assistant's session reaches only the listed
  hosts, and the engine window reaches no network at all.
- The assistant ships with YapYap releases, no longer on its own.
- People who used the extension download the private model again.
