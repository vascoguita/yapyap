# AI assistant

YapYap's AI assistant suggests replies and writes messages right above the
message box, with a private model that runs on your computer or with the
AI provider you choose. You stay in charge of every message: the assistant
reads a chat only once you allow it there, sends nothing until you have
seen it and clicked **Send**, and nothing reaches the chat until you send
the draft yourself.

The assistant is an extension made by YapYap, with releases of its own, so
it gets fixes and features without waiting for a YapYap release. Install
it from **Extensions… → Marketplace**, or download the `.yapyap-extension`
file from its release page and use **Install Extension…**.

## Choose a provider

Open **Extensions…**, find **AI assistant**, and open **Settings**:

| Setting          | What it does                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider         | **anthropic** for Claude, **openai** for OpenAI, **compatible** for your own OpenAI-compatible server, or **built-in** for the private model on this computer     |
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
- With the private model, it uses that model, listed as **Private model**.

When your provider releases a newer model, Auto moves to it by itself.
Pick a model in the list to use that one instead; the assistant keeps your
pick until you change it, or until your provider stops offering it, when
it goes back to Auto.

## Run a model on your own computer

If you already run a model on your computer with Ollama, Alpaca, LM Studio
or llama.cpp, the assistant can find it for you. Until you choose a
provider, the bar above the message box and the assistant's panel offer
**Find a model**:

1. Choose **Find a model**.
2. YapYap asks **Let AI assistant look for AI models on this computer?**
   Choose **Allow**. YapYap then checks the usual addresses of those
   servers on this computer (ports 11434, 11435, 1234 and 8080) and asks
   each only for its list of models. Nothing leaves your computer, and
   YapYap remembers your answer.
3. YapYap asks once more whether the assistant may use the server it found,
   such as `localhost:11434`. Choose **Allow**.

The assistant then uses that server, and Auto picks its smallest model.
Your messages never leave your computer. If nothing is found, the
assistant says so: install [Ollama](https://ollama.com) and download a
model, or choose a provider. If you denied the first question and want to
be asked again, turn **Connect to servers running on this computer** off
and on again for the assistant in **Extensions…**. A provider you choose in
**Settings** always wins over the server the assistant found.

You can also set a server up yourself: choose the **compatible** provider
and its address on this computer, such as `http://localhost:11434/v1`.
The bar lists the models you installed. Such a server needs no
API key. Turn on **Local-only mode** to make sure of it: the assistant then
refuses to ask anything but a server on this computer. YapYap lets the
assistant reach servers on this computer only because you approved
**Connect to servers running on this computer** when you installed it,
and never other machines on your network. The first time the assistant
uses a server, YapYap asks you to allow that address, such as
`localhost:11434`; allow only the model server you set up. Servers that only
answer apps they know, such as Ollama or the one Alpaca runs, need no setup:
YapYap handles that for the servers you allowed.

## Private model on this computer

The assistant can run an AI model by itself, inside YapYap, with nothing
else to install and no account or key. Your messages never leave your
computer.

When you have not chosen a provider and no model runs on your computer
(the bar's **Find a model** found none), the bar and the panel offer **Use
a private model on this computer (about 1.1 GB, downloaded once)**. Nothing
is downloaded until you choose **Use a private model**. Then:

1. The bar shows how far the download is, such as **Downloading the private
   model: 40% (450 of 1,117 MB)**. You can keep using WhatsApp meanwhile.
   If the connection drops or you quit YapYap, choose **Resume** later: the
   download carries on from where it stopped.
2. Once it is all there, the assistant checks the file against the exact
   fingerprint (SHA-256) it was built with. A file that does not match is
   deleted, never used.
3. The first time you ask for suggestions, the bar says **Warming up the
   model…** while the model loads into memory, then answers.

**Which model.** The assistant picks it for you: Qwen2.5 1.5B Instruct, about
1.1 GB, or, on a computer with less than 8 GB of memory or fewer than 4
processor cores, the smaller Qwen2.5 0.5B Instruct, about 490 MB. If the
model does not fit in memory, the assistant says so and offers **Try the
smaller one**. The panel names the model under **Advanced**.

**Speed.** Most laptops run the model on the processor, which is slower than
a provider over the internet, and keeps the processor busy while it
answers. On a 2018 laptop with an Intel Core i5 and no usable graphics
chip, the smaller model gave its first suggestions about 15 seconds after
the click, warming up included, and later ones in about 3 seconds; the
usual model is larger and takes longer. A computer whose graphics chip
YapYap can use through WebGPU runs it faster.
Small models are good at short replies and rewording, and less good at long
or tricky messages; for those, a provider such as Claude does better.

**Space and removal.** The panel shows the space the model takes. **Remove
model** deletes it and forgets your choice, and the assistant goes back to
offering a provider or a model on your computer. Choosing a provider in
**Settings** also takes over from the private model.

**Privacy.** The model runs in the assistant's own sandboxed page. The
download comes from Hugging Face (`huggingface.co` and its download
server, `us.aws.cdn.hf.co`), which sees your IP address as for any
download, but never your messages. The model is data: the engine that runs
it, [wllama](https://github.com/ngxson/wllama) (MIT), ships inside the
signed assistant, and nothing that runs is ever downloaded.

The models are [Qwen2.5 1.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF)
and [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF)
by the Qwen team at Alibaba Cloud, under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

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
   the chat's latest messages to your provider, or, with the private model,
   read them on your computer. **Allow here** allows it in that chat only;
   nothing is read before.
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

## Catch up on unread chats

Choose **Catch up on unread chats** for a short summary of what is waiting
for you, without opening a chat.

1. The assistant reads WhatsApp's chat list, never a chat itself: opening a
   chat would mark it read and tell the people who wrote that you saw their
   messages. It takes up to 20 unread chats from the top of the list.
2. The panel shows exactly what will be sent: each unread chat's name, how
   many messages are unread, and its latest message, as the chat list
   previews it. A photo or voice message shows as "(no text)".
3. **Send** sends it to your provider, or to the private model on your
   computer, and the summary appears in the panel for you alone.

The summary covers only what the chat list shows: the **latest** message of
each chat, not every unread message. Open a chat and choose **Summarize this
chat** for more of it.

The preview lists every unread chat, including chats where the assistant is
off, and **Send** sends all of it, this once; it allows the assistant in no
chat. If a chat in the list should not go to your provider, don't send, or
use the private model or a server on your computer.

The panel says so when no chat is unread. If it says YapYap does not let
the assistant see your unread chats, turn on **See which chats have unread
messages** for the assistant in **Extensions…**, for that account.

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
- see which chats have unread messages, with each one's count and latest
  message as the chat list shows it, but only when you ask it to catch you
  up; it never opens a chat;
- read your draft in the message box, but only when you ask it to rewrite it;
- write drafts in the message box, or replace yours with a rewrite, which you send yourself;
- show suggestions in the bar above the message box, which you put in the
  message box or send with a click;
- keep its own encrypted secrets (your key) and storage (the chats you
  allowed);
- reach `api.anthropic.com` and `api.openai.com`, and, if you set one, your
  compatible server, which YapYap asks you about before the first request;
- reach `huggingface.co` and `us.aws.cdn.hf.co` to download the private
  model, only when you choose to;
- reach servers running on this computer, for a model you run yourself,
  and ask YapYap to look for one, once you allow it;
- run an AI model on this computer, which can use a lot of its processor
  and memory while it answers.

It cannot send messages, read the messages of chats you did not open
(beyond the chat list's preview of the latest one, when you ask it to catch
you up), or see WhatsApp's page. When an update of the assistant asks for
something new, such as seeing your unread chats, YapYap keeps the update
waiting until you approve it in **Extensions…**. Your provider's own privacy terms apply to what you send them.
