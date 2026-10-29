# Marketplace

YapYap's marketplace lists YapYap's own extensions and third-party extensions the
maintainer has reviewed. Users install them from the Extensions window, or
from the website with **Install in YapYap**. The design is in
[ADR 0014](/adr/0014-extension-marketplace).

## Installing from the marketplace

Open **Extensions…** and choose the **Marketplace** tab. YapYap downloads the
list only then, checks that YapYap's own key signed it, and shows each
extension with its author, what it asks for, and whether it is YapYap's own or
a third-party extension YapYap reviewed. **Install** downloads that exact
version, checks it against the list, and opens the usual consent window.
A reviewed extension needs no acknowledgement of risk there, unlike an extension
installed from a file.

## Installing from the website

An extension's page on the website has an **Install in YapYap** button, a link
of the form `yapyap://extensions/install/<id>`. The link opens YapYap, which
looks the extension up in the signed list and shows the same consent window;
nothing installs until you choose **Install**. YapYap accepts only that
form, with a valid extension ID and nothing else: no address, file or
version can be passed this way, and while one link is being handled, others
are ignored.

## How an extension is listed

Each listed extension has an entry in the YapYap repository, in
`marketplace/extensions/<id>.json`:

```json
{
  "id": "org.example.translate",
  "summary": "Translates your draft before you send it.",
  "homepage": "https://example.org/translate",
  "license": "MIT",
  "review": "reviewed",
  "signer": "18:1e:…:d7",
  "repository": "https://github.com/example/translate",
  "versions": [
    {
      "version": "1.0.0",
      "tag": "v1.0.0",
      "source": "https://github.com/vascoguita/yapyap/releases/download/extensions/org.example.translate-1.0.0.yapyap-extension",
      "sha256": "sha256-…",
      "minYapYap": "0.1.2",
      "published": "2026-10-27T08:00:00.000Z",
      "notes": "First release."
    }
  ]
}
```

- `signer` is the fingerprint of your signing key, as the consent window
  and `yapyap-extension-sign verify` show it. Every version must be signed by
  that key; a new key needs a new review.
- `notes` is optional: what changed in that version, in plain text of up to
  2,000 characters. YapYap shows it with an update, and the extension's page
  on the website lists it beside each version.
- `source` is always a release asset of the YapYap repository, named
  `<id>-<version>.yapyap-extension`. Users never download from your server.
- The extension's name, author, capabilities and hosts come from each
  archive's own manifest, so the listing always matches the extension.

CI downloads every listed archive and checks its hash, signature, signer,
manifest and archive limits, and fails the pull request on any problem.

- `repository` and each version's `tag` say where the reviewed code lives.
  A third-party extension must give both.

## Submitting an extension

1. Publish your extension's signed `.yapyap-extension` as a release asset of your
   own repository, built from a tag.
2. Open a [extension submission](https://github.com/vascoguita/yapyap/issues/new?template=extension_submission.yml)
   with its ID, version, summary, repository and tag, the archive's URL and
   SHA-256, your key's fingerprint, its homepage and license, why it needs
   each capability and host, and its privacy policy if it connects
   anywhere.
3. The maintainer reviews the archive's own files against the checklist
   below. Ship readable JavaScript: no minified or obfuscated code.
4. Once the review passes, the maintainer copies that exact archive to
   YapYap's own hosting and opens the pull request that lists it, which CI
   checks. A new version goes through the same steps.

Third-party listings open once that hosting is set up
([#419](https://github.com/vascoguita/yapyap/issues/419)); submissions are
welcome before then.

### The review checklist

- Every capability and network host is needed for what the extension says it
  does, and nothing is requested "just in case".
- Network hosts belong to the service the extension describes, and a privacy
  policy says what happens to data sent there.
- The code is readable, matches the tag, and does nothing undeclared: no
  `eval`, no code fetched at run time, no tracking.
- The license allows redistribution, since YapYap hosts the archive.

### What "reviewed" means

A reviewed extension was read by YapYap's maintainer, who found nothing
harmful or undeclared in that exact version. It is not a guarantee, a
security audit, or an endorsement of the author's service. Every extension
still runs in its sandbox, gets only what you allow, and can be removed at
any time.

## Updates and pulled versions

A new version is listed the same way, and YapYap offers it in the
Marketplace tab. If a listed extension misbehaves, report it privately as a
[security advisory](https://github.com/vascoguita/yapyap/security/advisories/new).
The maintainer can pull a version or a whole extension through
`marketplace/revoked.json`: the index is signed again at once, and every
YapYap that reads it stops matching copies and tells the user why, without
deleting their data.
