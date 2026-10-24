# AI assistant

YapYap's AI assistant suggests replies with the AI model you choose. You
bring your own account with the provider, and you stay in charge of every
message: nothing about a chat is sent until you allow the assistant in it
and see exactly what will go, and a suggested reply only ever becomes a
draft that you edit and send yourself.

The assistant is a plugin made by YapYap, released with YapYap as a
`.yapyap-plugin` file. Install it with **Install Plugin…** like any other
plugin.

## Choose a provider

Open **Plugins…**, find **AI assistant**, and open **Settings**:

| Setting          | What it does                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Provider         | **anthropic** for Claude, **openai** for OpenAI, or **compatible** for your own OpenAI-compatible server |
| Model            | The model's name as your provider writes it. Claude uses `claude-opus-5-5` when this is empty            |
| Server address   | For **compatible** only: the server's `https://` address, such as `https://llm.example.org/v1`           |
| Messages to send | How many of the chat's latest messages the assistant sends: 5, 10 or 20                                  |

YapYap's own **Settings → Plugins → Messages a plugin may read** still caps
what any plugin can read, whatever the assistant asks for.

## Add your key

Choose **Plugin Commands → AI assistant: Assistant** to open its panel,
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

## What the assistant can do

When you install it, YapYap shows everything the assistant asks for, and
you can take any of it back later in **Plugins…**, for every account or
just one:

- read the open chat, but only when you ask it to look at it;
- write drafts in the message box, which you send yourself;
- keep its own encrypted secrets (your key) and storage (the chats you
  allowed);
- reach `api.anthropic.com` and `api.openai.com`, and, if you set one, your
  compatible server, which YapYap asks you about before the first request.

It cannot send messages, read chats you did not open, or see WhatsApp's
page. Your provider's own privacy terms apply to what you send them.
