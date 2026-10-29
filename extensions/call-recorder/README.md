# Call recorder

YapYap's own extension for recording WhatsApp calls (ADR 0015). It only asks:
YapYap shows its own prompt by the call, confirms consent before the first
recording, captures the sound and writes the file. The extension never
receives the sound, the file or its path.

```sh
pnpm --filter @yapyap/extension-call-recorder build   # writes dist/
```

Vite bundles `dist/main.js` (the hidden page, which holds YapYap's host API)
and `dist/panel.js` (the panel, which talks to the hidden page over a
`BroadcastChannel`), next to `manifest.json` from `public/`.

- `src/recorder.ts`: the commands, and the hidden page's answers to the panel.
- `src/panel.ts`: the panel: status, **Record**, **Stop**, and the recordings.
- `src/bus.ts`: the messages between them, checked on arrival.
