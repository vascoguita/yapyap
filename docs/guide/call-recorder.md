# Call recorder

YapYap's call recorder records your WhatsApp calls on this computer. It is
an extension made by YapYap, released with YapYap as a `.yapyap-extension`
file; install it with **Install Extension…** like any other extension.

::: warning Ask first
In many places it is against the law to record a call without the consent
of everyone on it. Ask everyone before you record. Before your first
recording, YapYap asks you to confirm that you know this.
:::

## Record a call

1. Start or answer a call in WhatsApp.
2. Open **File → Extension Commands → Call recorder: Recordings**, and
   choose **Record**, or choose **Call recorder: Record this call** in the
   same menu, or press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd>
   (<kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>R</kbd> on macOS).
3. YapYap opens a small window by the call, naming the extension that asks.
   Recording starts only when you choose **Record** there.

While it records, that window shows the time and **Stop**;
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>S</kbd>
on macOS) stops it too. Recording stops
when you choose **Stop**, when the call ends, when you switch to another
account, when YapYap quits, or after four hours.

## Your recordings

Recordings are saved in the `YapYap` folder of your Music folder, named by
date and time only, such as `YapYap call 2026-10-29 14.05.webm`: sound only,
in Opus, which browsers and players such as VLC open. Choose **WAV** under
Settings → Call recordings → **Record as** for files every program opens,
many times larger; **Save recordings to** picks another folder. **Show in folder** in the panel
opens the folder at a recording. Nothing is uploaded, and the extension
never receives the sound, the file or its name.

YapYap records the call's own sound and your microphone, never other apps'
sound. Recording is not available on macOS yet.
