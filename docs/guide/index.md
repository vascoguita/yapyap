# Getting started

YapYap wraps the official [WhatsApp Web](https://web.whatsapp.com) in a
hardened desktop app. Link it like any other device: open YapYap, then on
your phone open **WhatsApp → Linked devices → Link a device** and scan the
QR code.

::: tip Each account uses a linked-device slot
WhatsApp limits how many devices can be linked to one phone number. Every
account you add in YapYap uses one of those slots.
:::

::: warning Early development
YapYap is under active development. The first release, v0.1.0, will ship
installers for every supported platform. Follow progress on the
[project board](https://github.com/users/vascoguita/projects/5).
:::

## Settings

Open **File → Settings…** (on macOS, **YapYap → Settings…**), or press
<kbd>Ctrl</kbd>+<kbd>,</kbd> (<kbd>⌘</kbd>+<kbd>,</kbd> on macOS). Every
setting is a native control, so the window works fully from the keyboard,
and <kbd>Esc</kbd> closes it.

A setting that only takes effect at the next launch, such as hardware
acceleration, shows **Restart now** once you change it. Settings are saved
the moment you change them; if the settings file is ever damaged, YapYap
starts with the last good copy and tells you.
