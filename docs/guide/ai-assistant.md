# AI assistant

YapYap's assistant helps you write, in the message box itself. It
suggests short replies when someone writes to you, and rewrites what you
type in the tone you choose.

You stay in charge of every message:

- It works only in the chats you choose in Settings, or in every chat if
  you say so.
- It never sends a message. It only puts text in the message box, and you
  send it, as usual.
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
rewrite button's menu names the model in use, under **Assistant
settings**, which opens this list.

## In the chat

### Choose the chats it works in

**Settings → Assistant → Chats the assistant works in**:

- **Only the chats listed below**, the default. Open a chat in WhatsApp,
  then click **Add the Chat Open in WhatsApp**. **Remove** takes one back.
  Settings lists them by account.
- **All chats**: the assistant works in every chat.

Nothing of a chat is read for the assistant outside these chats.
**Messages the assistant reads** sets how many of a chat's latest
messages it reads to suggest replies: 5, 10 or 20.

### Suggested replies

When the last message in the open chat is someone else's, up to three
short replies appear right above the message box, in the chat's
language:

- Click one to put it in the message box, where you can edit it before
  you send it. A suggestion never sends itself.
- They go as soon as you start typing your own reply, and come back if
  you clear it.
- **×** dismisses them until the next message arrives.
- A chat that needs no reply, such as one that ends in a link or a
  sticker, gets none.

The assistant asks for suggestions once a message settles in, so a burst
of messages asks once, and only while YapYap's window is in front. Each
time, it reads the chat's latest messages. Turn off **Suggest replies** in
Settings to stop them.

### Rewrite what you type

Once you type in the message box, the assistant's button appears inside
it, just left of the microphone. It shows the way it rewrites, such as
**Polish**, and rewrites your text right where it is:

- Click it to rewrite your text that way.
- Its arrow opens the menu, upwards: **Polish** fixes grammar and flow and
  keeps your meaning, **Shorten** says the same in fewer words,
  **Elaborate** adds detail or polite phrasing, **Soften** makes the tone
  gentler and friendlier, and **Formalize** makes it more professional.
  The way you pick rewrites your text at once, and the button keeps it
  until YapYap restarts. The arrow keys move through the menu, and Esc
  closes it.
- **Assistant settings**, at the bottom of the menu, names the model in
  use and opens Settings at the assistant.

Nothing is sent: press Enter to send the rewrite, as usual. A slim line
above the message box says what was done, such as "Softened. Edit it or
send as is.", with **Undo** to put your own text back. It goes once you
send, undo or open another chat. If you change your text while the
assistant works, your text stays as it is. A rewrite sends only your
text, never the chat, and keeps its language.

When something is missing, such as a key or the private model's download,
or the assistant is off in the chat, the same line says so with a button
that fixes it: **Set up…**, **Paste a key…**, **Open settings**, **Resume
download** or **Try the smaller model**.

The **Assistant** menu opens the assistant's settings.

## Privacy

- The assistant reads a chat only in the chats you chose, or in every chat
  if you chose **All chats**, to suggest replies when someone else wrote
  last. A rewrite sends only what you typed.
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
