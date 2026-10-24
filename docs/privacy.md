# Privacy

YapYap is a desktop shell around the official WhatsApp Web. Your messages
travel between WhatsApp Web and WhatsApp's servers exactly as they do in a
browser. YapYap does not read, copy or upload them.

- **No telemetry.** YapYap collects no analytics, usage statistics or
  identifiers of any kind. An automated test runs a whole session behind a
  proxy that refuses and records every request leaving your computer, and
  fails if there is even one. The AppImage, the Windows installer and signed
  macOS builds update themselves: once at startup and then daily they read
  the latest release's metadata from GitHub, download a newer version in the
  background, verify it, and install it only when you agree to restart. The Windows
  portable build and unsigned macOS builds, which cannot update themselves,
  ask GitHub for the latest release once a day (a plain request to
  `api.github.com`, with nothing about you in it) and tell you when there is
  a new one; installs from Flatpak, DEB, RPM and the AUR never ask.
- **No hidden downloads.** Chromium normally fetches a spelling dictionary
  from Google whenever a window opens, which tells Google your language and
  your IP address. YapYap stops that, so spell checking is off until you
  turn it on under Settings → Spelling. Then, on Windows and Linux,
  Chromium downloads the dictionary for your language from Google once;
  macOS uses its own spell checker and downloads nothing. Words you add to
  the dictionary stay in YapYap's data folder.
- **Logs stay local and are redacted.** YapYap never logs message content.
  Before a line is written, phone numbers, email addresses, tokens and your
  home folder are replaced with placeholders. Logs live in the `logs` folder
  of YapYap's data folder. Each launch starts a new file, and a file is also
  rotated at 1 MB. At most five old files are kept, and they are deleted
  after 14 days.
- **Chats stay unread while YapYap is hidden.** When YapYap is hidden or
  minimized, WhatsApp sees its page as hidden and does not mark new messages
  in the open chat as read. Turn off **Keep chats unread while YapYap is
  hidden** in Settings → Privacy if you prefer the open chat to keep reading.
- **Crash reports are opt-in.** They are off unless you turn on **Crash
  reports** in Settings → Privacy. Then, after YapYap closes unexpectedly, it
  saves a plain-text report in its data folder (`crash-report.txt`): the
  version, operating system and graphics details, and the end of the
  previous session's log, which is already redacted. It never saves memory
  dumps, which could contain messages. With **Keep a report and offer to
  review it**, YapYap shows you the whole report at the next launch.
  Nothing is sent: **Report on GitHub** only opens a prefilled bug report in
  your browser, for you to read, edit and submit yourself.

A complete inventory of the data YapYap stores, where it is stored, and how
to delete it will be added here as each feature ships.
