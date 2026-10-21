# Install

::: warning No release yet
YapYap is in early development and has not been released. The first
release, v0.1.0, will appear on the
[releases page](https://github.com/vascoguita/yapyap/releases) and on
Flathub, in the formats below. To try YapYap before then, build
and run it from source as described in
[Development setup](https://github.com/vascoguita/yapyap/blob/master/CONTRIBUTING.md#development-setup).
:::

YapYap will be available in these formats:

| Platform         | Format                     | Updates                          |
| ---------------- | -------------------------- | -------------------------------- |
| Linux            | Flatpak (Flathub)          | Through Flatpak                  |
| Linux            | AppImage (x86_64, aarch64) | Built-in updater                 |
| Debian, Ubuntu   | DEB                        | Through your package manager     |
| Fedora, openSUSE | RPM                        | Through your package manager     |
| Arch Linux       | PKGBUILD for `yapyap-bin`  | Rebuild with each release        |
| Windows          | Installer (x64, arm64)     | Built-in updater                 |
| Windows          | Portable (x64, arm64)      | Notifies you of new versions     |
| macOS            | Universal DMG              | Built-in updater (signed builds) |

Releases are published on
[GitHub](https://github.com/vascoguita/yapyap/releases).

On Arch Linux, download `yapyap-bin.PKGBUILD` from a release, save it as
`PKGBUILD` in an empty folder, and run `makepkg -si` there. YapYap will be
published to the AUR as `yapyap-bin` once AUR account registration reopens.

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
