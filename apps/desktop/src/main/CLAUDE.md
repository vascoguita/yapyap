# Main process: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- Never use top-level `await` in the main entry. Playwright holds back the
  `ready` event until the entry module finishes evaluating, so the app hangs.
- App chrome pages are served from `app://chrome/` on the in-memory
  `yapyap-chrome` partition. Add an operation by extending `ChromeApi` in
  `src/shared/api/chrome-api.ts`, the preload bridge, and a handler registered
  through `registerChromeHandlers`, which checks the sender and payload. Node's
  URL parser treats `app:` as opaque, so compare origins with `isSameOrigin`.
  A window's handlers live in its feature's folder as `<page>-handlers.ts`;
  `src/main/chrome/` keeps only what every chrome window shares. Contracts
  between processes (`*-api.ts`) live in `src/shared/api/`, and the main
  process answers each in a `<name>-ipc.ts` or a handlers file.
  `src/main/` holds only `index.ts` beside its folders: lifecycle code goes
  in `app/`, small utilities in `support/`.
- A setting appears in the settings window only once YapYap acts on it: add
  it to `SETTING_FIELDS` in `src/shared/settings-fields.ts` in the PR that
  implements it. The `settings:set` handler accepts only listed fields and
  checks the whole result against the schema. A setting that changes the
  system, such as login items, goes through a `SettingEffect`
  (`settingEffects` of `createChromeFeature`), which runs before saving and
  returns the text Settings shows when the system refuses.
- Screen capture reaches the permission handler as `display-capture` (since
  Electron 45), and the legacy desktop `getUserMedia` as a `media` request with
  no device types that never reaches `setDisplayMediaRequestHandler`. Never
  grant either without a user pick; see `allowScreenCapture` in
  `src/main/permissions/session-guard.ts` and ADR 0001.
- WhatsApp never runs in the default session: each account has its own
  `persist:account-<uuid>` partition (`partitionOf`, ADR 0001), listed in
  `accounts.json`. Per-session guards such as downloads go on the account's
  session; in E2E tests, reach it through the WhatsApp page's web contents.
- Window geometry lives in `window-state.json`, not in settings: it is state,
  not a preference, and never goes in `settings.json`.
- Never let a rejected `loadURL` end startup. Load failures are reported by
  the recovery monitor (`src/main/recovery/`), which shows the recovery
  screen.
- Create windows only with `createSecureWindow` (or `createMainWindow`, for
  the page-less main window) in `apps/desktop/src/main/window/windows.ts`.
  Lint rejects `new BrowserWindow`, `BaseWindow`, `BrowserView` and
  `WebContentsView` anywhere else, and new per-web-contents guards go in
  `security/web-contents-guards.ts`.
- The assistant's network requests go only through its confined `fetch`
  (`src/main/assistant/net.ts`) on the in-memory `yapyap-assistant`
  session, whose request guard allows only Anthropic and OpenAI over HTTPS
  and the model server the user chose, at its origin. Never use
  `globalThis.fetch` or another session for them. Provider output is
  plain text, never markup.
- The model server's address (`assistant.server`) may use plain `http://`
  only on this computer and the home network; anywhere else needs
  `https://` (`src/shared/model-server.ts`, #627). The schema's pattern
  and `isModelServer` both hold that line, so a settings file cannot point
  the assistant's chats anywhere else.
- The `assistant` and `agents` settings sections are local: never exported
  or imported (`LOCAL_SECTIONS` in `settings/transfer.ts`). The chats the
  assistant may read live in `assistant-chats.json`, its keys (a model
  server's too) and chat names in `secrets.json`.
- The assistant never sends a message: it only puts text in the message
  box, and works only in the chats `assistant.chats` lets it (#616). Its UI
  text, including the bar's and the rewrite button's, lives in `en.json`
  under `assistant`.
- Every assistant request is `INSTRUCTIONS`, then `chatContext(chat)`,
  then the task (`assistant/prompts.ts`, #629). Keep the first two
  byte-identical across requests in a chat: Claude caches them, and
  anything that changes each time, such as the time now or the draft,
  goes in the task. Text people wrote passes through `defused` so it
  cannot close the `<chat>` or `<draft>` tags.
- YapYap listens on no port but the MCP server's (ADR 0019):
  `src/main/agents/listener.ts`, on `127.0.0.1`, only while **Let AI
  agents connect** is on. `no-endpoint.test.ts` fails if any other file
  opens a server. Every request passes `request-checks.ts` and a token
  before the official SDK (`@modelcontextprotocol/server`) sees it; each
  tool checks the token's accounts, scopes and chats again before it
  touches WhatsApp. The `agents` settings section is local like
  `assistant`, tokens live in `agent-tokens.json` as hashes, and their
  chat names in `secrets.json`.
- `--headless` (ADR 0021) runs with no window, tray or dialog: anything
  that shows one checks `headlessRequested(deps.argv)` first. Chromium's
  headless backend works only from the real command line
  (`--ozone-platform=headless`): appended with `appendSwitch`, Ubuntu's
  Chromium has already looked for X11 and crashes. YapYap then appends
  `--disable-gpu`; never turn on unsafe SwiftShader instead. The login QR
  code goes only to a terminal (`Terminal.isTTY`), never to the log. E2E
  tests start it with `spawnHeadless`, which drops the display.
