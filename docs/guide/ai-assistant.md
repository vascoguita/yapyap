# AI assistant

YapYap's AI assistant suggests replies and writes messages with the AI
model you choose, right above the message box. You bring your own account with
the provider, and you stay in charge of every message: nothing about a
chat is sent to the provider until you allow the assistant in it, and
nothing reaches the chat until you click **Send** or send the draft
yourself.

The assistant is an extension made by YapYap, with releases of its own, so
it gets fixes and features without waiting for a YapYap release. Install
it from **Extensions… → Marketplace**, or download the `.yapyap-extension`
file from its release page and use **Install Extension…**.

## Choose a provider

Open **Extensions…**, find **AI assistant**, and open **Settings**:

| Setting          | What it does                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider         | **anthropic** for Claude, **openai** for OpenAI, or **compatible** for your own OpenAI-compatible server                                                          |
| Server address   | For **compatible** only: the server's `https://` address, such as `https://llm.example.org/v1`, or a server on this computer, such as `http://localhost:11434/v1` |
| Messages to send | How many of the chat's latest messages the assistant sends: 5, 10 or 20                                                                                           |
| Local-only mode  | Only ask an AI server running on this computer, so nothing about your chats leaves it                                                                             |

YapYap's own **Settings → Extensions → Messages an extension may read** still caps
what any extension can read, whatever the assistant asks for.

## Choose the model

There is no model name to type. The bar names the model that answers, and
its list holds every model your provider offers, with **Auto** first, the
default:

- With Claude, Auto uses the newest of Claude's fast, inexpensive models
  (Haiku).
- With OpenAI, it uses the newest "mini" chat model.
- With a server on your computer, it uses the smallest model you installed,
  which answers fastest.

When your provider releases a newer model, Auto moves to it by itself.
Pick a model in the list to use that one instead; the assistant keeps your
pick until you change it, or until your provider stops offering it, when
it goes back to Auto.

## Run a model on your own computer

With a model server running on your computer, such as Ollama, choose the
**compatible** provider and its address on this computer, such as
`http://localhost:11434/v1`. The bar lists the models you installed. Such a server needs no
API key. Turn on **Local-only mode** to make sure of it: the assistant then
refuses to ask anything but a server on this computer. YapYap lets the
assistant reach servers on this computer only because you approved
**Connect to servers running on this computer** when you installed it,
and never other machines on your network. The first time the assistant
uses a server, YapYap asks you to allow that address, such as
`localhost:11434`; allow only the model server you set up. Servers that only
answer apps they know, such as Ollama or the one Alpaca runs, need no setup:
YapYap handles that for the servers you allowed.

## Add your key

Choose **Extension Commands → AI assistant: Assistant** to open its panel,
paste the API key from your provider's account into **API key**, and
choose **Save key**. YapYap keeps it encrypted with your system's secret
store (Keychain, Credential Manager or the Secret Service). The panel
never shows the key again; **Forget key** removes it.

## In the chat

Once the assistant is installed and set up, YapYap shows a bar in the open
chat, right above the message box, under the assistant's name.

1. Choose **Suggest replies**, or type what you want to say under **Write
   a message**, such as "I'll be ten minutes late", and press Enter.
2. The first time in a chat, the bar asks whether the assistant may send
   the chat's latest messages to your provider. **Allow here** allows it
   in that chat only; nothing is sent before.
3. The suggestions appear in the bar. Click one to put it in the message
   box, where you can edit it, or click its **Send** button to send it as
   it is.

When a message arrives in the chat you have open, the bar asks for
suggestions on its own, so replies are ready by the time you look. It does
this only while YapYap's window is in front, and each chat still asks
before its messages first go to your provider. To ask only when you
choose **Suggest replies**, turn off **Settings → Extensions → Suggest
replies automatically**.

YapYap sends only on your click, and only to the chat the suggestion was
made for: if you opened another chat meanwhile, it clears the suggestions
and sends nothing. To hide the bar, take back the assistant's permission
to show suggestions in your chats in **Extensions…**.

## Suggest replies in the panel

The panel shows exactly what will be sent before anything goes.

1. Open a chat in WhatsApp, then **Look at this chat** in the panel.
2. The assistant is off in every chat until you choose **Allow in this
   chat**. YapYap remembers chats you allowed by a fingerprint of their
   name, never the name itself. **Stop allowing in this chat** takes it
   back.
3. The panel shows exactly what will be sent: the instructions and the
   chat's latest messages, marked **Me** or **Them**. Nothing is sent yet.
4. **Send** sends it to your provider. The answer appears as it arrives;
   **Stop** cancels it.
5. Pick one of the suggested replies. It goes into the message box as a
   draft; edit it and send it yourself, or delete it.

## Summarize a chat

Open a chat and choose **Summarize this chat**. As with replies, the
assistant must be allowed in the chat, and the panel shows exactly what
will be sent: the chat's latest messages, as many as **Messages to send**
allows. After **Send**, the summary appears in the panel for you alone;
nothing of it goes to the chat or the message box.

## Rewrite your draft

1. Type a message in WhatsApp's message box, without sending it.
2. In the panel, under **Rewrite my draft**, choose a **Style**:
   **Friendlier**, **More formal**, **Shorter**, or **Translate** into the
   **Language** you type.
3. Choose **Rewrite my draft**. As with replies, the assistant must be
   allowed in the chat, and the panel shows exactly what will be sent: the
   instructions and your draft.
4. **Send**, then pick the rewrite to put it in place of your draft. Edit
   it and send it yourself, or undo with your keyboard's undo shortcut.

## What the assistant can do

When you install it, YapYap shows everything the assistant asks for, and
you can take any of it back later in **Extensions…**, for every account or
just one:

- read the open chat, but only when you ask it to look at it;
- read your draft in the message box, but only when you ask it to rewrite it;
- write drafts in the message box, or replace yours with a rewrite, which you send yourself;
- show suggestions in the bar above the message box, which you put in the
  message box or send with a click;
- keep its own encrypted secrets (your key) and storage (the chats you
  allowed);
- reach `api.anthropic.com` and `api.openai.com`, and, if you set one, your
  compatible server, which YapYap asks you about before the first request;
- reach servers running on this computer, for a model you run yourself.

It cannot send messages, read chats you did not open, or see WhatsApp's
page. Your provider's own privacy terms apply to what you send them.
