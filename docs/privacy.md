# Privacy

YapYap is a desktop shell around the official WhatsApp Web. Your messages
travel between WhatsApp Web and WhatsApp's servers exactly as they do in a
browser. YapYap does not read, copy or upload them.

- **No telemetry.** YapYap collects no analytics, usage statistics or
  identifiers of any kind. An automated test runs a whole session behind a
  proxy that refuses and records every request leaving your computer, and
  fails if there is even one. Self-updating builds will also contact their
  update server, which the test will allow once updates ship.
- **No hidden downloads.** Chromium normally fetches a spelling dictionary
  from Google whenever a window opens, which tells Google your language and
  your IP address. YapYap stops that, so spell checking is off until you
  choose languages yourself.
- **Logs stay local and are redacted.** Message content, phone numbers, email
  addresses and secrets are removed before anything is written.
- **Crash reports are opt-in.** They are saved locally, and you review them
  before choosing to submit them.

A complete inventory of the data YapYap stores, where it is stored, and how
to delete it will be added here as each feature ships.
