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

## Theme

Choose **Light**, **Dark** or **Same as the system** under Settings →
Appearance. The change applies at once to YapYap's windows, their title bars
and WhatsApp itself, as long as WhatsApp's own theme (in WhatsApp's
settings) is left at **System default**. Animations are turned off when your
system asks for reduced motion.

## Graphics problems

If the window flickers, stays blank or video calls show artifacts, turn off
**Use hardware acceleration** or **Use hardware video decoding** in
Settings → Reliability, then restart.

If YapYap cannot even show its window, start it in **safe mode**, which
turns off hardware acceleration for that launch only:

- **Linux:** right-click YapYap in your app launcher and choose **Start in
  Safe Mode**, or run `yapyap --safe-mode`.
- **Windows:** run `YapYap.exe --safe-mode`.
- **macOS:** run `open -a YapYap --args --safe-mode`.

When graphics crash three times within a day, YapYap starts the next launch
without hardware acceleration on its own and tells you. **Copy technical
details** in About includes the graphics mode, so bug reports show it.

## Screen sharing

When you share your screen in a WhatsApp call, YapYap asks what to share
before anything is captured. On Windows, X11 and macOS before 15, YapYap's
own picker lists your screens and windows with previews, and nothing is
selected until you choose. On Windows you can also tick **Also share system
audio**. On Wayland and macOS 15 and later, your system's own picker asks
instead. Cancelling, closing the picker or pressing <kbd>Esc</kbd> shares
nothing.

## When WhatsApp misbehaves

The **Account** menu has two maintenance actions:

- **Clear Cache and Reload** removes WhatsApp's cached files and service
  worker, then reloads. You stay logged in, so try this first when WhatsApp
  looks broken or will not update.
- **Reset Session…** logs you out and deletes WhatsApp's data on this
  computer. YapYap asks first. Your chats stay on your phone; link this
  device again to continue.

## Chat links

Only one YapYap runs at a time: starting it again brings the open window
back. Clicking a `whatsapp://` link, or opening a `https://wa.me/` or
`https://api.whatsapp.com/send` link with YapYap, opens that chat in WhatsApp,
with any prefilled text. YapYap accepts only the phone number and the text
from these links.

## Window and quitting

YapYap reopens where you left it, at the same size, and maximized or full
screen if it was. If that spot is on a monitor that is no longer connected,
it opens at its default size instead.

On Windows and Linux, closing the window quits YapYap, and **Hide the menu
bar** under Settings → Appearance hides the menu until you press
<kbd>Alt</kbd>. <kbd>Ctrl</kbd>+<kbd>,</kbd> opens Settings either way. On
macOS, closing the window keeps YapYap running, as other Mac apps do: click
its Dock icon to bring the window back, and choose **Quit** to quit.

## Zoom

Make WhatsApp bigger or smaller with **View → Zoom In** and **Zoom Out**
(<kbd>Ctrl</kbd>+<kbd>=</kbd> and <kbd>Ctrl</kbd>+<kbd>-</kbd>, or
<kbd>⌘</kbd> on macOS), or hold <kbd>Ctrl</kbd> and scroll. Each step is 5%,
from 50% to 300%. **Actual Size** (<kbd>Ctrl</kbd>+<kbd>0</kbd>) goes back to
100%. YapYap remembers the level for next time.

## Copy and paste

Paste images straight into a chat: screenshots, images copied in a browser,
and on Linux image files copied in your file manager. WhatsApp cannot read
your clipboard; it can only copy to it while you are using its window, as
when you copy a message. YapYap itself only writes to the clipboard when you
click one of its **Copy** buttons.

## Downloads

Files you download from WhatsApp go straight to your Downloads folder, and
YapYap tells you when each one is done, or if it failed. File names are
cleaned up so they are safe on every system: folder parts and characters
Windows does not allow are removed, and a file is never replaced. A second
`photo.jpg` is saved as `photo (1).jpg`.
