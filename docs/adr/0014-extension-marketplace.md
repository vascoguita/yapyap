# 0014. The extension marketplace

- Status: Accepted
- Date: 2026-10-27

## Context

Extensions install today from a `.yapyap-extension` file the user picks, or from
a URL with a pinned hash (ADR 0004). The maintainer wants a marketplace
(#386): official extensions and third-party extensions, listed and
installed inside YapYap, and installable from the website with one click
on **Install in YapYap**. Third-party extensions are not reviewed (see the
2026-10-31 amendment for #419).

A marketplace is a new way for code to reach the user's machine, so it must
not weaken ADR 0004. A compromised web host, a hostile website, a stale
copy of the list or a swapped download must not install anything the user
did not choose, or anything the maintainer did not vouch for. Opening it
must not tell anyone more about the user than an ordinary download does.

## Decision

### The index

1. **One signed index.** The marketplace is `index.json` at
   `https://packages.guita.org/extensions/index.json`, with an Ed25519
   signature over its exact bytes in `index.json.sig`. It is signed with
   the extension signing key, and YapYap verifies it against the first-party
   trust anchors compiled into the app (ADR 0004). An index that fails
   verification, fails the schema, or is larger than 2 MiB is refused as a
   whole; YapYap never shows part of one.
2. **What it holds.** A `serial` (a number that only grows), a `generated`
   and an `expires` time, the extensions, and the revocations. Each extension has
   its ID, name, summary, author, homepage, SPDX license, `review`
   (`official` or `unreviewed`) and the fingerprint of the key that signs
   it. An official extension has its versions. Each version has its
   version, the archive's URL, size and SHA-256, the capabilities and
   network hosts its manifest asks for, the oldest YapYap version that runs
   it, and when it was published. An unreviewed extension has instead
   `latest`, an HTTPS address that always serves its author's latest
   archive, on any host, and optionally its source `repository`; it has no
   versions and no hashes.
   Every string has a length limit and the list has at most 1,000 extensions.
   Screenshots stay on the website, so the app never loads remote images.
3. **No old copies.** YapYap keeps the highest `serial` it has accepted and
   refuses a lower one, so nobody can serve an older index that still lists
   a pulled version. It refuses an index past `expires`, which is at most
   30 days after `generated`; a scheduled workflow re-signs the index every
   week, so a frozen copy stops working within a month. A refused or
   unreachable index shows a clear message, and installed extensions keep
   running.
4. **Where archives live.** Official archives are under
   `https://packages.guita.org/extensions/`, which redirects to a release
   asset of the YapYap repository, as the package repositories do
   (ADR 0003); a swapped file fails its SHA-256 before it is unpacked.
   An unreviewed extension's archive downloads from its `latest` address,
   its author's own server, which may be anywhere. The marketplace's
   session refuses any request that is not HTTPS, each redirect included.
   The usual archive checks and signature verification (ADR 0004) run on
   every archive.

### Trust

5. **Who vouches for what.** `official` extensions are YapYap's own
   (`org.guita.yapyap.*`, signed by a trust anchor), and listing a version
   means the maintainer released exactly that archive, identified by its
   SHA-256. `unreviewed` extensions are third-party, and nobody reviews
   them: the index vouches only for the key. Whatever their `latest`
   address serves installs only if it is signed by the key whose
   fingerprint the index lists, for the listed ID; anything signed by
   another key is refused before the user is asked. That key is then pinned
   to the extension ID as with any third-party install, so an update signed
   by another key is refused too. The version, name, capabilities and hosts
   come from the archive's own manifest.
6. **The consent screen still decides.** A marketplace install shows the
   same consent window as a file: the author, the fingerprint, every
   capability and host. An unreviewed extension is marked **Third-party** in the Marketplace tab, with the host it downloads from,
   and its consent window says that YapYap has not reviewed it, names that
   host, says that the host sees the user's IP address, and that the user
   installs it at their own risk. **Install** stays off until the user
   ticks the acknowledgement that ADR 0004 asks of any third-party
   extension, and the main process refuses the install without it.
7. **Updates.** When the user opens the Marketplace tab, YapYap compares
   the installed marketplace extensions with the index. An official
   version newer than the installed one that runs on this YapYap is
   offered. For an installed unreviewed extension, YapYap sends a `HEAD`
   request to its `latest` address and compares the file's ETag and
   Last-Modified with what it saw last time, kept beside the extensions'
   records; the same file needs no download. Otherwise, or when the
   server says neither, it downloads the archive (capped at the archive
   limit), checks its signature against the listed key, and offers its
   version if it is newer and not pulled. YapYap never sends those values
   back, as `If-None-Match` would, since a server could make each user's
   unique and recognize them by it. A downgrade or the same version is not
   an update. Updates are offered, never installed silently, and one that
   adds capabilities or hosts is staged until the user approves it, as
   today.
8. **Pulling an extension.** A revocation names an extension ID, all or some of its
   versions, the signer's fingerprint and a reason. When YapYap reads it,
   it stops matching installed copies, whatever their source, and shows
   the reason in the Extensions window. The copies stay installed, with their
   data, until the user removes them, so a mistaken revocation loses
   nothing. An extension only counts as matching if its signer's fingerprint
   matches, so nobody can revoke someone else's extension by reusing its ID.

### Privacy

9. **Only when asked.** YapYap downloads the index only when the user opens
   the Marketplace tab or follows an install link. It is a plain `GET`
   from the main process on an in-memory session, with no cookies, no
   identifiers, nothing about the installed extensions, and nothing
   counted per user. The host sees the user's IP address, as with any
   download; YapYap logs nothing per user. Opening the tab also asks each
   installed unreviewed extension's author's server for its latest
   archive, the same way, so that server sees the user's IP address and
   that they have the extension; the tab says so.

### Installing from the website

10. **`yapyap://extensions/install/<id>`.** YapYap registers the `yapyap:`
    scheme. It accepts exactly this form, where the ID matches the
    manifest's ID pattern; anything else is refused and logged without its
    content. The link carries no URL, file or version: YapYap looks the ID
    up in the signed index and opens the Marketplace tab on that extension,
    with its **Install** button. Nothing installs without the user's click,
    a burst of links opens at most one prompt, and a link for an unlisted ID
    says so.

### Submissions

11. **One pull request, once.** A third-party author opens one pull
    request that adds `marketplace/extensions/<id>.json` with the
    extension's ID, name, summary, author, homepage, license, `latest`
    address, the fingerprint of their signing key and, if they want, the
    source repository and screenshots. After that they release as they
    wish, with no further pull requests. CI checks the entry's shape and
    that `latest` is HTTPS, and, on the pull request that adds or changes
    the entry only, downloads what `latest` serves and checks that it is
    signed by the listed key, for the listed ID, with a valid manifest and
    within the archive limits. A wrong archive or a definite error such as
    `404` fails the pull request; a server that does not answer, after
    three tries, only warns, so a server down for a moment does not block
    it, and no other pull request ever depends on an author's server. The
    weekly re-signing never downloads third-party archives either. Since
    the pull request's author chooses that address, the check is a plain
    `GET` to public HTTPS hosts only: no user name or password in the
    address, every address the host resolves to outside loopback, private,
    link-local (cloud metadata), carrier-grade NAT and unspecified ranges,
    each redirect checked the same way before it is followed, at most five
    of them, and the download cut off past the archive limit. The CI job
    runs with read-only permissions, no secrets and no persisted
    credentials.

## Consequences

- ADR 0004 gains a second way in: a signed index vouching for an official
  archive's SHA-256 and signer, or for a third-party extension's key. The
  consent window, archive checks, signatures, key pinning and staged
  updates all still apply.
- ADR 0001 gains outbound requests from the main process, to
  `packages.guita.org` and to the `latest` addresses of installed
  unreviewed extensions, made only on the user's action, and one URL
  scheme, validated like the `whatsapp:` links.
- The extension signing key now also signs the index, so its compromise would
  let an attacker list any archive. Rotation stays as in ADR 0004, and the
  scheduled re-signing workflow uses the same secret, in a job that
  publishes only the index. For an unreviewed extension the author's key
  matters as much: whoever holds it can ship anything to everyone who
  installed the extension, which the user accepts when they install it.
- The weekly re-signing is required: if it stops for a month, the
  marketplace refuses the index until it runs again.
- Follow-up work: building and publishing the index (#387), the Marketplace
  tab (#388), install links (#389), the website pages (#390) and the
  submission and review process (#391).

## Amendments

- 2026-10-31 (#474, the maintainer's decision): first-party extensions stay
  in the YapYap repository, but are released on their own, with their own
  versions, changelogs and `<name>-vX.Y.Z` tags, instead of with each app
  release. A released extension is built and signed alone, attached to its
  own release, and listed by a PR the release workflow opens. The
  maintainer's merge of that PR is the review that the index signature
  records. Each version's `minYapYap` comes from `yapyap.minVersion` in the
  extension's `package.json`. Third-party extensions keep their own
  repositories.
- 2026-11-01 (ADR 0017): the AI assistant is no longer an extension, so
  the marketplace no longer lists it and it has no release-please
  component of its own. It ships with YapYap. The call recorder is the
  first-party extension that still releases on its own.
- 2026-11-01 (#419, the maintainer's decision): the maintainer does not
  review third-party extensions. The marketplace always points at an
  extension's latest release, which may be on any host, not only GitHub;
  authors release as they wish, and the only thing they do, once, is open
  the pull request that lists their extension. Users install third-party
  extensions at their own risk. So `reviewed` gives way to `unreviewed`,
  whose entry holds the `latest` address and the author's key instead of
  versions and hashes, and the review checklist, the copying of archives
  to YapYap's releases and the `repository` and `tag` that reviews needed
  are gone. Items 2, 4, 5, 6, 7, 9 and 11 above describe the result. The
  index stays `index.json`, now with `format: 2`; there is no copy in the
  first format, since YapYap keeps no backward compatibility before 1.0
  (C45 in ADR 0008). The conflict with security, and how it is kept
  small, is C46 in ADR 0008.
