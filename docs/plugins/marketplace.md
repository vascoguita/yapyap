# Marketplace

YapYap's marketplace lists YapYap's own plugins and third-party plugins the
maintainer has reviewed. Users install them from the Plugins window, or
from the website with **Install in YapYap**. The design is in
[ADR 0014](/adr/0014-plugin-marketplace).

## How a plugin is listed

Each listed plugin has an entry in the YapYap repository, in
`marketplace/plugins/<id>.json`:

```json
{
  "id": "org.example.translate",
  "summary": "Translates your draft before you send it.",
  "homepage": "https://example.org/translate",
  "license": "MIT",
  "review": "reviewed",
  "signer": "18:1e:…:d7",
  "versions": [
    {
      "version": "1.0.0",
      "source": "https://github.com/vascoguita/yapyap/releases/download/plugins/org.example.translate-1.0.0.yapyap-plugin",
      "sha256": "sha256-…",
      "minYapYap": "0.1.2",
      "published": "2026-10-27T08:00:00.000Z"
    }
  ]
}
```

- `signer` is the fingerprint of your signing key, as the consent window
  and `yapyap-plugin-sign verify` show it. Every version must be signed by
  that key; a new key needs a new review.
- `source` is always a release asset of the YapYap repository, named
  `<id>-<version>.yapyap-plugin`. Users never download from your server.
- The plugin's name, author, capabilities and hosts come from each
  archive's own manifest, so the listing always matches the plugin.

CI downloads every listed archive and checks its hash, signature, signer,
manifest and archive limits, and fails the pull request on any problem.

## Submitting a plugin

Open a pull request that adds your entry, with `source` pointing at a
release of your own repository for now. The maintainer reviews the
archive's own files, so ship readable JavaScript: no minified or
obfuscated code. Once the review passes, the maintainer copies the archive
into YapYap's releases, changes `source` to it and merges. The published
review checklist is tracked in
[#391](https://github.com/vascoguita/yapyap/issues/391).

## Updates and pulled versions

A new version is listed the same way, and YapYap offers it to users who
installed the plugin from the marketplace. A version can be pulled through
`marketplace/revoked.json`: YapYap then stops matching copies and tells the
user why, without deleting their data.
