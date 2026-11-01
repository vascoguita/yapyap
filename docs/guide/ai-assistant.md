# AI assistant

YapYap's assistant helps you write, right above the message box. It
suggests replies, writes the message you describe, rewrites your draft in
another tone or language, sums up a long chat, and catches you up on your
unread chats.

You stay in charge of every message:

- It reads a chat only after you allow it there, and you can see exactly
  what it sends first.
- It never sends a message. It puts drafts in the message box, and you
  send them, or click a suggestion's send button yourself.
- YapYap logs none of it.

The assistant is part of YapYap. There is nothing to install.

## Set it up

Open **Settings**. **Assistant** is the first section. You can also use
**Assistant → Assistant Settings…**, or the gear in the bar above the
message box. The first time you start YapYap, the Welcome offers the same
choices.

Under **Where the assistant thinks**, choose one:

| Choice                          | What it means                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Automatic                       | Uses the first one that is set up, in this order: the private model, a model server on this computer, Claude, OpenAI |
| Private, on this computer       | A small model that runs inside YapYap. Your messages never leave your computer. It downloads once                    |
| Claude (Anthropic)              | Claude, with your own API key                                                                                        |
| OpenAI                          | OpenAI, with your own API key                                                                                        |
| A model server on this computer | A model you already run, with Ollama, LM Studio, llama.cpp or another server that speaks OpenAI's API                |

**In use** marks the one that answers now.

### With Claude or OpenAI

1. Choose **Get a key from Anthropic** or **Get a key from OpenAI**, and
   create an API key in your account there.
2. Paste it into **API key for Claude (Anthropic)** or **API key for
   OpenAI**, and choose **Save Key**.
3. Choose **Test** to check that the provider accepts it.

YapYap keeps the key encrypted with your system's secret store (Keychain,
Credential Manager or the Secret Service), never in its settings. It never
shows the key again. **Forget key** removes it. If your system has no
secret store, YapYap says it cannot keep the key safely, and does not
save it.

### With a model server on this computer

If you run a model with Ollama, Alpaca, LM Studio or llama.cpp, choose
**Find**. YapYap checks the usual addresses of those servers on this
computer (ports 11434, 11435, 1234 and 8080), asks each only for its list
of models, and lists what it found. Choose **Use** beside one.

Your server listens somewhere else? Type its address under **Or type its
address**, such as `http://localhost:11434/v1`, and choose **Use this
address**. Only addresses on this computer are accepted.

Such a server needs no key, and nothing leaves your computer.

### With the private model

Choose **Download** under **Private, on this computer**. Nothing is
downloaded before you do.

- The section shows how far the download is, such as **Downloading: 40%
  (450 MB of 1.1 GB)**. You can keep using WhatsApp meanwhile.
- **Pause** stops it and keeps what came. **Resume** carries on from where
  it stopped, also after the connection dropped or YapYap quit.
- If the disk is full, YapYap says how much room to free, then you can
  resume.
- Once it is all there, YapYap checks the file against the exact
  fingerprint (SHA-256) it expects. A file that does not match is deleted,
  never used.
- **Remove** deletes the model.

**Which model.** YapYap picks it for you: Qwen2.5 1.5B Instruct, about
1.1 GB, or, on a computer with less memory than a typical 8 GB laptop or
fewer than 4 processor cores, the smaller Qwen2.5 0.5B Instruct, about
490 MB. If a model does not fit in memory, the assistant says so and
offers **Try the smaller model**.

**Speed.** Most laptops run the model on the processor, which is slower
than a provider over the internet, and keeps the processor busy while it
answers. The first answer also waits for the model to load. A computer
whose graphics chip YapYap can use runs it faster. Small models are good
at short replies and rewording, and less good at long or tricky messages;
for those, Claude or OpenAI do better.

YapYap loads the model only when you first ask, and frees its memory again
after five minutes without a question.

The models are [Qwen2.5 1.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF)
and [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF)
by the Qwen team at Alibaba Cloud, under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). The
engine that runs them, [wllama](https://github.com/ngxson/wllama) (MIT),
ships with YapYap; nothing that runs is ever downloaded.

## Choose the model

There is no model name to type. **Model** lists every model the provider
offers, with **Auto (recommended)** first, the default:

- With Claude, Auto uses the newest of Claude's fast, inexpensive models
  (Haiku).
- With OpenAI, it uses the newest "mini" chat model.
- With a server on your computer, it uses the smallest model you
  installed, which answers fastest.
- With the private model, it uses that model.

When your provider releases a newer model, Auto moves to it by itself. The
same list sits in the bar, beside **Assistant**.

## In the chat

Open a chat. The bar sits right above the message box:

- **Suggest replies**: three short replies to choose from. Click one to
  put it in the message box, where you can edit it, or click its send
  button to send it as it is.
- **Write a message**: type what you want to say, such as "I'll be ten
  minutes late", and press Enter. The assistant writes it in the chat's
  language and tone.
- **Summarize**: a few short points about the chat, for you alone. **Copy**
  copies them; **Close** hides them.
- **Rewrite**: type a draft in the message box, then pick a style:
  **Friendlier**, **More formal**, **Shorter**, or **Translate to** one of
  your system's languages or English. **Use** puts the rewrite in place of
  your draft.
- **Catch up**: what is waiting in your unread chats. See below.
- The gear opens Settings, at the assistant.

When something is missing, such as a key or the private model's download,
the bar says so with a button that fixes it: **Set up…**, **Paste a
key…**, **Resume download** or **Try the smaller model**.

### Allow the assistant in a chat

The first time you ask for anything in a chat, the bar asks: **Allow the
assistant to read this chat?**

- **What is sent?** shows the exact text first: the instructions, and the
  chat's latest messages marked **Me** or **Them**, or your draft.
- **Allow here** allows it in that chat only, and answers.

Nothing of the chat is read for the assistant before. **Settings →
Assistant → Messages the assistant reads** sets how many of the latest
messages it reads: 5, 10 or 20. Settings lists the chats you allowed, by
account, with **Remove** to take one back.

### Catch up on unread chats

**Catch up** sums up what is waiting for you, without opening a chat.

1. The assistant reads WhatsApp's chat list, never a chat itself: opening
   a chat would mark it read and tell the people who wrote that you saw
   their messages.
2. The bar shows exactly what will be sent: each unread chat's name, how
   many messages are unread, and its latest message, as the chat list
   previews it. A photo or voice message shows as "(no text)".
3. **Send** sends it, this once, and the summary appears in the bar.

The summary covers only the **latest** message of each chat. The preview
lists every unread chat, including chats where the assistant is off, and
**Send** allows the assistant in none of them. If a chat in the list
should not go to your provider, choose **Close** instead, or use the
private model or a server on your computer.

### Suggestions as messages arrive

When a message arrives in the chat you have open, the assistant suggests
replies on its own, so they are ready when you look. It does this only in
chats you allowed, and only while YapYap's window is in front. Turn off
**Suggest replies as messages arrive** in Settings to ask only when you
choose.

## Shortcuts

| Action                   | Keys                     |
| ------------------------ | ------------------------ |
| Suggest replies          | Ctrl+Shift+Y (⌘+Shift+Y) |
| Summarize this chat      | Ctrl+Shift+L (⌘+Shift+L) |
| Catch up on unread chats | Ctrl+Shift+U (⌘+Shift+U) |

The same actions are in the **Assistant** menu. Change the keys in
**Keyboard Shortcuts…**. They answer in the bar, so open a chat first;
with none open, a notification says so.

## Privacy

- The assistant reads a chat only once you allowed it there, and only when
  you ask, or when a message arrives in a chat you allowed.
- **Settings → Assistant → Privacy** says where what you ask about goes
  right now: nowhere off your computer with the private model or a server
  on your computer, or to Anthropic or OpenAI with them.
- YapYap sends the assistant's requests only to `api.anthropic.com`,
  `api.openai.com`, Hugging Face (for the private model's download, which
  sees your IP address as any download does, never your messages) and the
  model server you chose on this computer. It refuses any other address.
- YapYap keeps no chat text. It remembers the chats you allowed by a
  fingerprint of their name; the names it shows in Settings are kept only
  encrypted by your system, and not at all where your system cannot keep
  them safely.
- Your provider's own privacy terms apply to what you send them.

See also [Privacy](../privacy.md).

## Troubleshooting

**"… did not accept your key."** Paste a new key in Settings, then
**Test** it.

**"The model server on this computer does not answer."** Start the server,
such as by opening Ollama, then ask again. **Find** in Settings checks
again.

**"This computer doesn't have enough memory for this model."** Choose
**Try the smaller model**, or close other apps and try again.

**The bar does not show.** Open a chat: the bar sits above its message
box. Check that **Show the assistant in chats** is on in Settings.
