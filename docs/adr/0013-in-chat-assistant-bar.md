# 0013. The in-chat assistant bar

- Status: Accepted
- Date: 2026-10-26

## Context

The AI assistant (#103) lives in a panel window: a person opens it, asks
for replies, approves a preview of what is sent, picks a reply, and goes
back to WhatsApp. The maintainer wants it in the chat itself (#407): reply
suggestions right by the message box, a field to ask for a message in
one's own words, and a way to send a suggestion with one click.

Two existing rules stand in the way. ADR 0004 keeps extensions out of
WhatsApp's page, so no extension can draw over it, imitate it, or read what it
does not hold a grant for. And extensions only insert drafts: no API sends a
message. Both protect people from hostile or broken extensions, and they
still should.

## Decision

1. **YapYap draws the bar, not the extension.** (Moved into WhatsApp's
   page on 2026-10-30; see the amendments.) The bar is a chrome view
   (`app://chrome/assistant-bar.html`, ADR 0001) that YapYap lays out in the
   main window directly beneath the active account's WhatsApp view, which
   it shortens by the bar's height. Nothing is injected into WhatsApp's
   page: WhatsApp cannot read, restyle or imitate the bar, and the bar keeps
   working whatever WhatsApp changes in its layout. It shows only while a
   extension holding `assistant:bar` for the account runs, and the user can
   hide it; it never covers WhatsApp.
2. **Extensions fill it with plain text.** An extension holding the new
   `assistant:bar` capability, granted per account like the others, calls
   `host.assistant.offer({ chat, suggestions })` with up to five strings of
   at most 1,000 characters each. YapYap checks them against a schema and
   shows them as text, never markup, under the extension's name, and only
   while the chat they were made for is the open chat. The bar's
   **Write a message** field passes what the user types to the extension only
   when the user presses Enter in it (see 5).
3. **Sending is YapYap's, on the user's click.** Clicking a suggestion
   puts it in the message box, as `composer:insert-draft` already does. Its
   **Send** button, drawn by YapYap, replaces the draft with the suggestion
   and presses Enter in WhatsApp's message box, once per click, through
   `webContents.sendInputEvent`. No extension API sends a message, and nothing
   sends without a click in YapYap's own bar: an extension can only offer text.
4. **Reading the chat stays behind the existing grants.** The assistant
   still needs `chat:read-active` for the chat, still asks before it is
   used in a chat for the first time, and still sends only as many messages
   as Settings allows. The panel's preview of exactly what is sent becomes
   a setting, **Show what is sent first**, on by default for new chats.
5. **Nothing happens on its own.** The bar asks the extension for
   suggestions only when the user clicks **Suggest replies** or presses
   Enter in **Write a message**, as `suggest` and `prompt` events. No
   chat is read or sent anywhere because a message arrived, and the adapter
   still adds no observers to WhatsApp's page. Typing in WhatsApp's message
   box never waits for the bar, and the bar keeps its height while it
   waits, so WhatsApp's view does not jump.

## Consequences

- ADR 0004 gains the `assistant:bar` capability and the rule that only
  YapYap's own interface sends a message, after a click.
- ADR 0001 gains the bar as a chrome view in the main window, with the
  same CSP, preload and sender checks as the sidebar (since 2026-10-30,
  the bar in WhatsApp's page and its bridge in the adapter's world).
- The panel stays for setup (provider, key, model) and for longer work,
  such as summaries.
- The bar is a second place where extension text appears in YapYap's own
  interface. It is always labelled with the extension's name, so it cannot
  pass for WhatsApp's or YapYap's own suggestions.

## Amendments

- 2026-10-27 (#407): an offer is `{ suggestions, status, confirm }`, with
  no `chat`. YapYap notes which chat was open when the user asked, so a
  extension cannot name another, and uses or sends a suggestion only while
  that chat is still open. `confirm` labels a button that sends the extension
  a `confirm` request, which the AI assistant uses to ask before a chat's
  messages first leave. The **Show what is sent first** setting is not
  built: the bar asks once per chat, and the assistant's panel keeps the
  full preview.
- 2026-10-30 (#466, the maintainer's decision): the bar moves into
  WhatsApp's page, directly above the open chat's message box, so it reads
  as part of the chat and the conversation moves up to make room instead of
  WhatsApp's whole view getting shorter. This reverses decision 1's
  "nothing is injected into WhatsApp's page" for the bar alone; the
  maintainer chose it over a floating overlay, knowing WhatsApp's layout
  changes can break it (C35 in ADR 0008). What the bar shows and does, its
  state, and the main process's logic are unchanged:
  - The adapter renders it, in its isolated world (`ADAPTER_WORLD_ID`), as
    source text that gets the state and YapYap's labels as JSON. It keeps
    one element right before the message box's footer (a new `LANDMARKS`
    entry), puts it back when WhatsApp redraws the chat and drops it, and
    removes it when the bar hides or no chat is open. It reports only
    whether the bar is on the page.
  - The bar lives in a closed shadow root with its own small stylesheet, so
    WhatsApp's scripts cannot read the suggestions and its styles cannot
    restyle them. WhatsApp can see that an element is there, and could
    remove or cover it, but not read what it says. Extension text is
    written only with `textContent`, never as markup.
  - The bar's buttons and its **Write a message** field act only on events
    whose `isTrusted` is true, so a page script cannot click them, and
    keyboard, input and clipboard events stop at the shadow root, so
    WhatsApp's own shortcuts do not take what the user types there.
  - The WhatsApp preload exposes the bar's five actions (suggest, prompt,
    confirm, use, send) only in the adapter's isolated world, with
    `contextBridge.exposeInIsolatedWorld`, never in WhatsApp's own. Each
    sends a fixed channel. The main process acts on it only when it comes
    from the active account's WhatsApp view, on WhatsApp's origin, with an
    index from 0 to 4 or a non-blank request of at most 2,000 characters.
  - The adapter still adds no observers to WhatsApp's page. While the bar
    shows and the main window is visible and focused, the main process
    renders it again about once a second, and at once when its state or
    the account on screen changes; a render that finds the bar in place
    with the same content changes nothing. The page of an account no
    longer on screen loses its bar.
  - The chrome view, its page and the space the main window kept for it
    are gone.
- 2026-10-30 (#467, the maintainer's decision): an offer may carry a
  `choice`, such as the model in use, which the bar shows as a list beside
  the extension's name. Picking an option sends the extension a `choose`
  request with its value, only for an option the extension offered, and
  asks for suggestions again if some were showing. The bar never saves
  the pick; the extension keeps it in its own storage. The AI assistant
  has no Model setting: its list holds **Auto** and every model the
  provider lists, and Auto picks the newest of the provider's quick tier
  (Claude's Haiku, OpenAI's mini models) or a local server's smallest
  model, so no model name is ever written into it.
- 2026-10-30 (#468, the maintainer's decision): decision 5 no longer holds
  as written. When a message arrives in the open chat, the bar asks its
  extension for suggestions as **Suggest replies** does. A YapYap setting,
  **Suggest replies automatically**, is on by default and turns it off.
  While the bar shows for an extension, is not already waiting, and
  YapYap's window is visible and focused, the main process looks about
  every second and a half. It asks the page, in the adapter's isolated
  world, for a hash of the open chat and one of its newest message from
  someone else. Both are taken from the message's ID and hashed in the
  page, so no ID, phone number or text leaves it. It asks only when the
  message hash changes in the same chat on the same page; opening another
  chat or account, or coming back to YapYap, only notes what is there.
  The adapter still adds no observers. Each chat still asks before its
  messages first go to a provider.
- 2026-10-31 (#457): the AI assistant's private model, which runs on the
  user's computer, joins its providers, and its list names it **Private
  model (…)**. While the model downloads or warms up, the assistant offers
  the bar its progress as a status line without being asked, as any
  extension may, so the bar shows how far the download is, then **Warming
  up the model…**; a stopped download or a model that does not fit in
  memory comes with a confirm button (**Resume**, **Try the smaller
  one**). Its consent asks to read the chat's messages, which stay on the
  computer, rather than to send them to a provider.
