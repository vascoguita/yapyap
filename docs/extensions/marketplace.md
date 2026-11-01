# Marketplace

YapYap's marketplace lists YapYap's own extensions and extensions by other
authors. YapYap does not review other authors' extensions: you install them
at your own risk. Users install from the Extensions window, or from the
website with **Install in YapYap**. The design is in
[ADR 0014](/adr/0014-extension-marketplace).

## Installing from the marketplace

Open **Extensions…** and choose the **Marketplace** tab. YapYap downloads the
list only then, checks that YapYap's own key signed it, and shows each
extension with its author and whether it is YapYap's own or **Third-party**. A third-party extension also shows the server it downloads
from, which is its author's.

**Install** downloads the extension and opens the usual consent window,
which shows everything it asks to do:

- For YapYap's own extensions, YapYap downloads the exact version the list
  names and checks it against the list.
- For a third-party extension, YapYap downloads its author's latest release
  from the author's server, over HTTPS only. It installs it only if the
  release is signed by the key the list names for that extension; anything
  signed by another key is refused. The consent window names the author's
  server, says that it sees your IP address, and keeps **Install** off until
  you tick that you install the extension at your own risk.

Each time you open the tab, YapYap also checks whether the third-party
extensions you installed have a newer release. It first asks their authors'
servers whether the file changed, without downloading it, and downloads it
only if it did; it offers a newer version only if the same key signed it.
Their servers see your IP address when it asks.

## Installing from the website

An extension's page on the website has an **Install in YapYap** button, a link
of the form `yapyap://extensions/install/<id>`. The link opens YapYap, which
looks the extension up in the signed list and shows the same consent window;
nothing installs until you choose **Install**. YapYap accepts only that
form, with a valid extension ID and nothing else: no address, file or
version can be passed this way, and while one link is being handled, others
are ignored.

## Listing your extension

You list your extension once, with one pull request. After that, the
marketplace always offers whatever your latest release is: release as often
as you like, wherever you like, with no further pull requests.

1. [Sign your extension](/extensions/#sign-it) with your own key, and keep
   the key safe: every release must be signed by it, and YapYap refuses any
   other.
2. Publish the signed `.yapyap-extension` at an HTTPS address that always
   serves your latest release. On GitHub, attach it to each release under the
   same file name, and use
   `https://github.com/<owner>/<repo>/releases/latest/download/<file>`. Any
   other host works as long as the address stays the same and serves the
   newest file.
3. Open a pull request to the YapYap repository that adds
   `marketplace/extensions/<id>.json`:

```json
{
  "id": "org.example.translate",
  "name": "Translate",
  "summary": "Translates your draft before you send it.",
  "author": { "name": "Example", "url": "https://example.org" },
  "homepage": "https://example.org/translate",
  "license": "MIT",
  "review": "unreviewed",
  "signer": "18:1e:…:d7",
  "latest": "https://github.com/example/translate/releases/latest/download/org.example.translate.yapyap-extension",
  "repository": "https://github.com/example/translate",
  "screenshots": [{ "file": "main.png", "caption": "Translating a draft" }]
}
```

- `signer` is the fingerprint of your signing key, as the consent window
  and `yapyap-extension-sign verify` show it.
- `latest` is a plain HTTPS address with no credentials, which YapYap
  downloads with no cookies or other headers that say who the user is.
- `name`, `summary` and `author` are shown in the marketplace before anyone
  installs. The version, capabilities and hosts always come from your
  archive's own manifest.
- `repository` is optional: where your source code lives.
- `screenshots` is optional: up to five PNG or WebP images of at most 1 MiB
  each, committed in `marketplace/screenshots/<id>/` with the entry, and a
  caption for each. They are served beside the list and shown on the
  extension's page on the website, never loaded from your server.

CI checks the entry, then downloads what `latest` serves and checks that it
is signed by `signer`'s key, has your extension's ID and a valid manifest,
and fits the archive limits. A wrong archive, or an address that answers
with an error such as `404`, fails the pull request. If your server does
not answer at all, CI only warns, so try again if it was down.

## Your responsibilities

YapYap lists your extension without reviewing it, and tells users so. You
are responsible for what your releases do. Keep your signing key private:
whoever holds it can ship an update to everyone who installed your
extension. An update that asks for new capabilities or hosts waits until
each user approves it.

## Pulled extensions

If an extension misbehaves, report it privately as a
[security advisory](https://github.com/vascoguita/yapyap/security/advisories/new).
The maintainer can pull a version or a whole extension through
`marketplace/revoked.json`: the list is signed again at once, and every
YapYap that reads it stops matching copies and tells the user why, without
deleting their data. A pulled third-party extension disappears from the
marketplace, and a pulled version of one is never offered or installed.
