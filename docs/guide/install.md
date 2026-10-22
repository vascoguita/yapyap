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

| Platform         | Format                     | Updates                      |
| ---------------- | -------------------------- | ---------------------------- |
| Linux            | Flatpak (Flathub)          | Through Flatpak              |
| Linux            | AppImage (x86_64, aarch64) | Built-in updater             |
| Debian, Ubuntu   | DEB                        | Through your package manager |
| Fedora, openSUSE | RPM                        | Through your package manager |
| Arch Linux       | PKGBUILD for `yapyap-bin`  | Rebuild with each release    |
| Windows          | Installer (x64, arm64)     | Built-in updater             |
| Windows          | Portable (x64, arm64)      | Notifies you of new versions |
| macOS            | Universal DMG              | Notifies you of new versions |

Releases are published on
[GitHub](https://github.com/vascoguita/yapyap/releases).

On Arch Linux, download `yapyap-bin.PKGBUILD` from a release, save it as
`PKGBUILD` in an empty folder, and run `makepkg -si` there. YapYap will be
published to the AUR as `yapyap-bin` once AUR account registration reopens.

## First launch on macOS and Windows {#unsigned}

YapYap's macOS and Windows builds are not code-signed yet: signing
certificates cost money every year, and YapYap is free. Your system warns
you the first time you open it. Before you allow it, you can
[check that your download is genuine](#verify-a-download).
[Sponsoring YapYap](https://github.com/sponsors/vascoguita) helps pay for
signing.

**macOS.** macOS says it cannot verify that YapYap is free of malware.

1. Drag YapYap from the DMG to Applications and open it once. Close the
   warning.
2. Open **System Settings → Privacy & Security**, scroll down to the message
   about YapYap, and click **Open Anyway**. Confirm with your password.

From then on YapYap opens normally. If you prefer the terminal, this does the
same:

```sh
xattr -dr com.apple.quarantine /Applications/YapYap.app
```

Unsigned macOS builds can't update themselves, so YapYap tells you when a new
version is out instead.

**Windows.** SmartScreen shows "Windows protected your PC". Click
**More info**, then **Run anyway**. YapYap still updates itself, and checks
each update's hash before installing it.

Linux packages need none of this.

## Verify a download

Every release includes `SHA256SUMS`, a CycloneDX software bill of materials,
and signed build provenance attestations, so you can check that a file is
exactly what YapYap's release workflow built:

```sh
sha256sum --check --ignore-missing SHA256SUMS
gh attestation verify YapYap-0.1.0-linux-x86_64.AppImage --repo vascoguita/yapyap
```

## Beta versions {#betas}

Every release is first published as a beta, at least three days ahead, so
testers can catch problems before everyone gets the update. Betas are
pre-releases on the
[releases page](https://github.com/vascoguita/yapyap/releases), tagged like
`v0.2.0-beta.1`, and are built, tested and signed like releases.

- **AppImage, Windows installer and portable, macOS:** turn on **Get beta
  updates** under Settings → General. YapYap then offers or announces each
  beta as it does releases. Turning it off never goes back to an older
  version: you keep the beta until the next release.
- **Flatpak, DEB, RPM and Arch Linux:** these get updates from your system,
  so the setting isn't there. Download the beta's package from its
  pre-release and install it by hand; the next release replaces it.

Found a problem? [Open an issue](https://github.com/vascoguita/yapyap/issues/new/choose)
and paste **Help → Copy Diagnostics**, which names the beta you run.

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
