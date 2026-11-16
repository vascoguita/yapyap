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

Open **Settings → Assistant**, or use the gear in the bar above the message
box, which opens Settings there. The first time you start YapYap, the Welcome offers the same
choices.

Until you choose a provider, the assistant is off, and nothing is sent
anywhere. Under **Provider**, choose one. Only the one you choose opens and
shows what it needs, such as its key:

| Choice             | What it means                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Claude (Anthropic) | Claude, with your own API key                                                                                           |
| OpenAI             | OpenAI, with your own API key                                                                                           |
| Model server       | Any server that speaks OpenAI's API: Ollama or LM Studio on this or another computer, or a cloud service of your choice |

The line at the top of the page says whether the assistant is ready, such
as "Ready. Using Claude (Anthropic).", or what the chosen provider still
needs. Each provider shows its own status: **Key saved** or **Needs key**,
and **Address saved** or **Not set up**. Under the list, one sentence says
what the assistant sends, and where.

### With Claude or OpenAI

1. Choose **Claude (Anthropic)** or **OpenAI**, then **Get a key from
   Anthropic** or **Get a key from OpenAI**, and create an API key in your
   account there.
2. Paste it into **API key**, and choose **Save Key**.
3. Choose **Test** to check that the provider accepts it.

YapYap keeps the key encrypted with your system's secret store (Keychain,
Credential Manager or the Secret Service), never in its settings. It never
shows the key again: **Replace** puts in another, and **Remove** removes it. If your system has no
secret store, YapYap says it cannot keep the key safely, and does not
save it.

### With a model server

Choose **Model server**. It works with any server that speaks OpenAI's API.

**On this computer.** If you run a model with Ollama, Alpaca, LM Studio or
llama.cpp, choose **Find on This Computer**. YapYap checks the usual
addresses of those servers on this computer (ports 11434, 11435, 1234 and
8080), asks each only for its list of models, and lists what it found.
Choose **Use** beside one. Nothing leaves your computer.

**Somewhere else.** Type the server's address under **Address**, and
choose **Use This Address**. For example:

- `http://192.168.1.10:11434` for Ollama on another computer at home.
- `https://openrouter.ai/api/v1` for a cloud service YapYap doesn't list.

Plain `http://` works only on this computer and your home network, such as
`localhost`, `192.168.x.x`, `10.x.x.x` or a `.local` name. Any other
address needs `https://`. If you leave out `http://` or `https://`, YapYap
adds `http://` where it is allowed, and `https://` elsewhere. An address
with no path gets `/v1`. YapYap refuses an address with a user name or
password in it.

**API key (optional)**: only if the server asks for one, as cloud services
do. YapYap keeps it encrypted, like the keys for Claude and OpenAI, and
sends it to that server only.

## Choose the model

There is no model name to type. **Model** lists every model the provider
offers, with **Auto (recommended)** first, the default:

- With Claude, Auto uses the newest of Claude's fast, inexpensive models
  (Haiku).
- With OpenAI, it uses the newest "mini" chat model.
- With a model server, it uses the smallest model that Ollama reports on a
  server at home, which answers fastest, and otherwise the first model the
  server lists.

When your provider releases a newer model, Auto moves to it by itself. The
rewrite button's menu names the model in use, under **Assistant
settings**, which opens this list.

## In the chat

### Choose the chats it works in

**Settings → Assistant → Where the assistant works**:

- **Only chosen chats**, the default. Open a chat in WhatsApp, then click
  **Add Open Chat**. **Remove** takes one back.
  Settings lists them by account.
- **All chats**: the assistant works in every chat.

Nothing of a chat is read for the assistant outside these chats.
**Messages it reads** sets how many of a chat's latest
messages it reads to suggest replies and rewrite your text: 20, 50 (the
default) or 100. More gives answers that fit the conversation better;
each takes a little longer. However many you choose, a request holds at
most about 8,000 tokens of chat, the newest messages first.

### What the model reads

For a suggestion or a rewrite, the model reads the same things:

- Which chat it is: a chat with a contact, by their name, or a group, by
  its name.
- The chat's latest messages, each with its time and who sent it. You are
  "Me". In a group, others go by the names WhatsApp shows; someone known
  only by their number goes by "Person 1", "Person 2" and so on, and no
  phone number is sent. A reply carries the message it quotes.
- Today's date and time, so "tomorrow" and "on Friday" mean what you mean.
- For a rewrite, your text.

The model is told to treat what people wrote as part of the conversation,
never as instructions. A message such as "ignore your instructions" changes
nothing about what it does. It writes as you do in that chat, in its
language, with your own length, tone and emoji, and invents no facts, times
or places.

With Claude, the instructions and the chat are cached by Anthropic for a
few minutes, so a rewrite right after suggestions, or another way of
rewriting the same text, answers sooner and costs less. YapYap asks
the newest models for little thinking: a chat message rarely needs more,
and it saves time.

### Suggested replies

When the last message in the open chat is someone else's, up to three
short replies appear right above the message box, in the chat's
language. They are real choices, such as yes, not now, and a question
back, written the way you write in that chat. Where an answer needs
something only you know, such as whether you are free, they work without
it rather than guess:

- Click one to put it in the message box, where you can edit it before
  you send it. A suggestion never sends itself.
- They go as soon as you start typing your own reply, and come back if
  you clear it, even after a rewrite.
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
- Its arrow opens the menu, upwards:
  - **Polish** fixes spelling, grammar, punctuation and accents, and
    changes nothing else: your words, slang and tone stay, and text that
    is already right comes back as it is.
  - **Shorten** says the same in about half the words, keeping every
    point and question.
  - **Elaborate** makes it fuller and clearer, spelling out what the chat
    makes obvious, such as which dinner "it" is, with no made-up details.
  - **Soften** makes it gentler and friendlier at about the same length:
    requests instead of demands, no blame or sarcasm, and a no stays a no.
  - **Formalize** makes it polite and professional, without slang or
    emoji, and still a chat message rather than an email.
    The way you pick rewrites your text at once, and the button keeps it
    until YapYap restarts. The arrow keys move through the menu, and Esc
    closes it.
- **Assistant settings**, at the bottom of the menu, names the model in
  use and opens Settings at the assistant.

Nothing is sent: press Enter to send the rewrite, as usual. A slim line
above the message box says what was done, such as "Softened. Edit it or
send as is.", with **Undo** to put your own text back. It goes once you
send, undo or open another chat. If you change your text while the
assistant works, your text stays as it is. A rewrite reads the chat too,
so it fits what was said, and keeps your text's language.

When something is missing, such as a provider or a key, or the assistant
is off in the chat, the same line says so, such as "Set up the assistant to
start: choose a provider.", with a button that opens Settings where it
fixes it: **Set up…**, **Paste a key…** or **Open settings**.

The **Assistant** menu opens the assistant's settings.

## Privacy

- The assistant reads a chat only in the chats you chose, or in every chat
  if you chose **All chats**, to suggest replies when someone else wrote
  last and to rewrite what you typed. No phone number is sent.
- Nothing is sent anywhere until you set up a provider.
- **Settings → Assistant**, under the list of providers, says where what
  you ask about goes right now: nowhere off your computer with a model
  server on this computer, or to Anthropic, OpenAI or your server's host.
- YapYap sends the assistant's requests only to `api.anthropic.com` and
  `api.openai.com` over HTTPS, and to the model server you chose. It
  refuses any other address.
- YapYap keeps no chat text. It remembers the chats you allowed by a
  fingerprint of their name; the names it shows in Settings are kept only
  encrypted by your system, and not at all where your system cannot keep
  them safely.
- Your provider's own privacy terms apply to what you send them.

See also [Privacy](../privacy.md).

## Troubleshooting

**"… did not accept your key."** Paste a new key in Settings, then
**Test** it.

**"Set up the assistant to start: choose a provider."** No provider is
chosen yet. If you used the private model or Automatic in an earlier
version of YapYap, choose a provider again in Settings; your saved keys
for Claude and OpenAI are still there.

**"Your model server does not answer."** Check its address in Settings,
and start the server, such as by opening Ollama, then ask again. **Find on
This Computer** checks again.

**"Type a server address…"** The address is not one YapYap accepts. Plain
`http://` works only on this computer and your home network; use
`https://` for anything else.

**The bar does not show.** Open a chat: the bar sits above its message
box. Check that **Show the assistant in chats** is on in Settings.
