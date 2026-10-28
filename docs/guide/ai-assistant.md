# AI assistant

YapYap's AI assistant suggests replies with the AI model you choose. You
bring your own account with the provider, and you stay in charge of every
message: nothing about a chat is sent until you allow the assistant in it
and see exactly what will go, and a suggested reply only ever becomes a
draft that you edit and send yourself.

The assistant is an extension made by YapYap, released with YapYap as a
`.yapyap-extension` file. Install it with **Install Extension…** like any other
extension.

## Choose a provider

Open **Extensions…**, find **AI assistant**, and open **Settings**:

| Setting          | What it does                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider         | **anthropic** for Claude, **openai** for OpenAI, or **compatible** for your own OpenAI-compatible server                                                          |
| Model            | The model's name as your provider writes it. Claude uses `claude-opus-5-5` when this is empty                                                                     |
| Server address   | For **compatible** only: the server's `https://` address, such as `https://llm.example.org/v1`, or a server on this computer, such as `http://localhost:11434/v1` |
| Messages to send | How many of the chat's latest messages the assistant sends: 5, 10 or 20                                                                                           |
| Local-only mode  | Only ask an AI server running on this computer, so nothing about your chats leaves it                                                                             |

YapYap's own **Settings → Extensions → Messages an extension may read** still caps
what any extension can read, whatever the assistant asks for.

## Run a model on your own computer

With a model server running on your computer, such as Ollama, choose the
**compatible** provider and its address on this computer, such as
`http://localhost:11434/v1`, with the model's name. Such a server needs no
API key. Turn on **Local-only mode** to make sure of it: the assistant then
refuses to ask anything but a server on this computer. YapYap lets the
assistant reach servers on this computer only because you approved
**Connect to servers running on this computer** when you installed it,
and never other machines on your network.

## Add your key

Choose **Extension Commands → AI assistant: Assistant** to open its panel,
paste the API key from your provider's account into **API key**, and
choose **Save key**. YapYap keeps it encrypted with your system's secret
store (Keychain, Credential Manager or the Secret Service). The panel
never shows the key again; **Forget key** removes it.

## Suggest replies

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
- keep its own encrypted secrets (your key) and storage (the chats you
  allowed);
- reach `api.anthropic.com` and `api.openai.com`, and, if you set one, your
  compatible server, which YapYap asks you about before the first request;
- reach servers running on this computer, for a model you run yourself.

It cannot send messages, read chats you did not open, or see WhatsApp's
page. Your provider's own privacy terms apply to what you send them.
