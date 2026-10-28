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

1. **YapYap draws the bar, not the extension.** The bar is a chrome view
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
  same CSP, preload and sender checks as the sidebar.
- The panel stays for setup (provider, key, model) and for longer work,
  such as summaries.
- The bar is a second place where extension text appears in YapYap's own
  interface. It is always labelled with the extension's name, so it cannot
  pass for WhatsApp's or YapYap's own suggestions.
