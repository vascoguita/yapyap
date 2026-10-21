# Troubleshooting

## YapYap says it cannot start safely {#sandbox}

YapYap always runs WhatsApp inside Chromium's sandbox, which keeps a
compromised page from reaching the rest of your computer. It never runs
without it. If the sandbox cannot start, YapYap explains why and quits
instead.

On Linux, this usually happens with the **AppImage** on Ubuntu 24.04 and
later, and on other distributions that restrict _unprivileged user
namespaces_ through AppArmor. An AppImage cannot ship the helper Chromium
uses instead, so it depends on those namespaces.

Choose one of these safe options:

- **Use the Flatpak, DEB or RPM package.** The Flatpak brings its own
  sandbox, and the DEB and RPM packages install Chromium's helper, so none of
  them depend on user namespaces. See [Install](./install.md).
- **Allow the AppImage with an AppArmor profile.** Save this as
  `/etc/apparmor.d/yapyap-appimage`, changing the path to where you keep the
  AppImage, then run `sudo apparmor_parser -r /etc/apparmor.d/yapyap-appimage`:

  ```text
  abi <abi/4.0>,
  include <tunables/global>

  profile yapyap-appimage /home/*/Applications/YapYap*.AppImage flags=(unconfined) {
    userns,
  }
  ```

::: danger Never turn the sandbox off
Do not start YapYap with `--no-sandbox`, and do not lift the user-namespace
restriction for your whole system. YapYap refuses to run without its
sandbox, and lifting the restriction weakens every other app too.
:::

## Reporting a problem {#diagnostics}

Choose **Help → Copy Diagnostics** and paste the result into your report. It
holds YapYap's version and install channel, Electron and Chromium versions,
your operating system, the graphics mode and a GPU summary, and the most
recent log lines. Log lines are redacted before they are written: phone
numbers, email addresses, tokens and your home folder never appear, and
YapYap never logs message content. Read it before you share it.
