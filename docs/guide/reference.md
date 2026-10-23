# Reference

The details behind the [user guide](/guide/): every setting, where YapYap
keeps its files, and how to start it from the command line.

## Settings

Change settings in **Settings** (<kbd>Ctrl</kbd>+<kbd>,</kbd>, or
<kbd>⌘</kbd>+<kbd>,</kbd> on macOS). They are saved in `settings.json` in
the [profile folder](#files).

| Setting                        | In the file                         | Default            | Notes                                                                         |
| ------------------------------ | ----------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| Start at login                 | `general.autostart`                 | Off                | Follows the system's login items; not yet in Flatpak (#234)                   |
| Start minimized                | `general.startMinimized`            | Off                | Opens in the tray or the Dock                                                 |
| Get beta updates               | `general.betaUpdates`               | Off                | Only in builds that update or announce updates; see [betas](install.md#betas) |
| Close to the tray              | `general.closeToTray`               | Off                | Windows and Linux; macOS always keeps running                                 |
| Theme                          | `appearance.theme`                  | Same as the system | `system`, `light` or `dark`                                                   |
| Hide the menu bar              | `appearance.autoHideMenuBar`        | Off                | Windows and Linux; <kbd>Alt</kbd> shows it                                    |
| Zoom                           | `appearance.zoom`                   | 100%               | Set from the View menu; 50% to 300%                                           |
| Use hardware acceleration      | `reliability.hardwareAcceleration`  | On                 | Takes effect after a restart                                                  |
| Use hardware video decoding    | `reliability.hardwareVideoDecoding` | On                 | Takes effect after a restart                                                  |
| Display backend                | `reliability.displayBackend`        | Automatic          | Linux; `auto`, `wayland` or `x11`; restart                                    |
| Memory limit                   | `reliability.memoryWatchdogMb`      | 2048 MB            | File only; 512 to 16384; see below                                            |
| Crash reports                  | `privacy.crashReports`              | Off                | `off`, `local` or `ask`; see [Privacy](/privacy)                              |
| Keep chats unread while hidden | `privacy.unreadWhileHidden`         | On                 | WhatsApp marks nothing read while YapYap is hidden or minimized               |

The file also has entries for features that are not built yet. YapYap
ignores them until those features arrive, and the settings window shows a
setting only once YapYap acts on it.

YapYap checks `settings.json` every time it starts, and never fails to start
because of it. An invalid value goes back to its default. A damaged file is
kept as `settings.corrupt-<time>.json`, and YapYap restores the previous copy
(`settings.json.bak`) or, if that is damaged too, the defaults. Settings
written by a newer version of YapYap are used but never changed.

### Memory limit

When WhatsApp keeps using more memory than `reliability.memoryWatchdogMb`
for two minutes, YapYap reloads it, which keeps you logged in and frees the
memory the page has piled up. It waits while you are typing or reading in
the window, so a draft is never cut off; only WhatsApp using more than one
and a half times the limit reloads regardless. The log notes the size and
the limit, nothing else.

## Files

Everything YapYap stores lives in one profile folder:

| System  | Profile folder                              |
| ------- | ------------------------------------------- |
| Linux   | `~/.config/YapYap`                          |
| Flatpak | `~/.var/app/org.guita.YapYap/config/YapYap` |
| Windows | `%APPDATA%\YapYap`                          |
| macOS   | `~/Library/Application Support/YapYap`      |

Inside it:

| Path                | What it holds                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `settings.json`     | Your settings, and `settings.json.bak`, the copy before the last change                      |
| `window-state.json` | The window's size and position, so it reopens where you left it                              |
| `gpu-crashes.json`  | The times of recent graphics crashes, which trigger the safe graphics fallback               |
| `running.json`      | The version and start time of the running session; left behind only if YapYap did not quit   |
| `crash-report.txt`  | With crash reports on, the report of the last unclean exit; a new one replaces it            |
| `logs/`             | Redacted logs: this session's `yapyap.log` and up to five older files, deleted after 14 days |
| Everything else     | WhatsApp Web's own data (your login, cache and local storage), kept by Chromium              |

The [privacy page](/privacy) explains what the logs contain. Deleting the
profile folder while YapYap is closed resets YapYap completely and logs you
out of WhatsApp.

## Command line

| Option                               | Effect                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `--safe-mode`                        | Starts without hardware acceleration, for this launch only (see [graphics problems](/guide/#graphics-problems)) |
| `--ozone-platform=wayland` or `=x11` | Linux: uses that display backend for this launch, over the setting and `ELECTRON_OZONE_PLATFORM_HINT`           |
| A chat link                          | Opens that chat, for example `yapyap "https://wa.me/15551234567?text=Hi"` (see [chat links](#chat-links))       |

The executable is `yapyap` on Linux and `YapYap.exe` on Windows. On macOS,
pass options with `open -a YapYap --args <options>`.

YapYap refuses to start with Chromium's `--no-sandbox` option or the
`ELECTRON_DISABLE_SANDBOX` environment variable, because they remove the
protection between WhatsApp Web and your computer.
[Troubleshooting](/guide/troubleshooting#sandbox) explains what to do if
your system triggers this.

YapYap reads no environment variables of its own. `YAPYAP_TEST_WHATSAPP_ORIGIN`
exists only for YapYap's automated tests. It points YapYap at a local fake
WhatsApp page and accepts only loopback `http` addresses.

## Chat links

YapYap registers itself for `whatsapp:` links and opens these forms in the
matching chat:

| Link                                                       | Opens                                |
| ---------------------------------------------------------- | ------------------------------------ |
| `whatsapp://send?phone=<number>&text=<text>`               | The chat with that number, prefilled |
| `https://wa.me/<number>?text=<text>`                       | The chat with that number, prefilled |
| `https://api.whatsapp.com/send?phone=<number>&text=<text>` | The chat with that number, prefilled |

The phone number and the text are optional. YapYap keeps only those two
values and drops everything else in the link. Starting YapYap while it is
already running passes the link to the open window.

## Keyboard shortcuts

On macOS, use <kbd>⌘</kbd> where this table says <kbd>Ctrl</kbd>.

| Shortcut                                                          | Action                      |
| ----------------------------------------------------------------- | --------------------------- |
| <kbd>Ctrl</kbd>+<kbd>,</kbd>                                      | Settings                    |
| <kbd>Ctrl</kbd>+<kbd>=</kbd>                                      | Zoom in                     |
| <kbd>Ctrl</kbd>+<kbd>-</kbd>                                      | Zoom out                    |
| <kbd>Ctrl</kbd>+<kbd>0</kbd>                                      | Actual size                 |
| <kbd>Ctrl</kbd>+<kbd>R</kbd>                                      | Reload WhatsApp             |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>                     | Reload, bypassing the cache |
| <kbd>F11</kbd> (macOS: <kbd>Ctrl</kbd>+<kbd>⌘</kbd>+<kbd>F</kbd>) | Full screen                 |
| <kbd>Alt</kbd>                                                    | Show a hidden menu bar      |
