# Preloads: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- WhatsApp's views have one preload, `src/preload/whatsapp/`, which replaces
  the page's `Notification` (ADR 0011). `installNotificationShim` runs in
  WhatsApp's main world as source text, so it may use nothing from outside
  its body; check `out/preload/whatsapp.cjs` after changing it. It exposes
  four bridges (`bridge.ts`): notifications (show, close, click) and screen
  shares (started, ended, stop) in WhatsApp's main world, and the assistant
  bar's five actions and the chat list divider's two (resize, reset) in the
  adapter's isolated world only. The main process checks everything they
  send.
