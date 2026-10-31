# AI assistant

YapYap's own extension for writing help with the AI model you choose: a
private model that runs on this computer, Claude (Anthropic), OpenAI, or any
server that speaks OpenAI's chat completions API. For a provider, you bring
your own key. YapYap keeps it encrypted with your operating
system's secret store, and the extension sends nothing without your say.

```sh
pnpm --filter @yapyap/extension-ai-assistant build   # writes dist/
```

Vite bundles the providers' official SDKs into `dist/main.js` (the extension's
hidden page, which holds YapYap's host API) and `dist/panel.js` (the panel,
which talks to the hidden page over a `BroadcastChannel`), next to
`manifest.json` from `public/`.

- `src/providers/`: one streaming interface over Anthropic's and OpenAI's SDKs,
  and the private model.
- `src/built-in/`: the private model (#457): its pinned catalog, the
  resumable, hash-checked download into the origin private file system, and
  wllama, whose `.wasm` Vite copies into `dist/` beside `main.js`.
- `src/settings.ts`: the settings form's choices, and the provider they make.
- `src/assistant.ts`: the hidden page's answers to the panel.
- `src/panel.ts`: the panel, where you paste your key.
