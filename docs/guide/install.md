# Install

YapYap will be available in these formats:

| Platform         | Format                     | Updates                          |
| ---------------- | -------------------------- | -------------------------------- |
| Linux            | Flatpak (Flathub)          | Through Flatpak                  |
| Linux            | AppImage (x86_64, aarch64) | Built-in updater                 |
| Debian, Ubuntu   | DEB                        | Through your package manager     |
| Fedora, openSUSE | RPM                        | Through your package manager     |
| Arch Linux       | AUR `yapyap-bin`           | Through your AUR helper          |
| Windows          | Installer (x64, arm64)     | Built-in updater                 |
| Windows          | Portable (x64, arm64)      | Notifies you of new versions     |
| macOS            | Universal DMG              | Built-in updater (signed builds) |

Releases are published on
[GitHub](https://github.com/vascoguita/yapyap/releases).

## Verify a download

Every release includes `SHA256SUMS`, a CycloneDX software bill of materials,
and signed build provenance attestations, so you can check that a file is
exactly what YapYap's release workflow built:

```sh
sha256sum --check --ignore-missing SHA256SUMS
gh attestation verify YapYap-0.1.0-linux-x86_64.AppImage --repo vascoguita/yapyap
```

## Flatpak permissions

The Flatpak runs in a sandbox with only the access it needs:

| Permission                                | Why                                                        |
| ----------------------------------------- | ---------------------------------------------------------- |
| Network                                   | WhatsApp Web and plugin connections                        |
| Wayland, or X11 as a fallback; GPU        | Drawing the window with hardware acceleration              |
| PulseAudio                                | Voice and video calls, voice messages, notification sounds |
| Notifications and StatusNotifier on D-Bus | Native notifications and the tray icon                     |
| Downloads folder                          | Saving files there automatically when you turn that on     |

Everything else, such as choosing where to save a file or picking a screen to
share, goes through desktop portals, so YapYap never sees the rest of your files.
