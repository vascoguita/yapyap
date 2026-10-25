#!/usr/bin/env bash
# Builds and signs the package site's indexes in a Debian container, so the
# host needs none of the packaging tools (#344). The release workflow and
# test.sh both run it.
#
# Usage: build-site.sh <site directory> <GNUPGHOME holding the signing key>
#
# The signing key is the only secret key in the GNUPGHOME.
set -euo pipefail

here=$(dirname "$(realpath "$0")")
site=$(realpath "$1")
gnupg=$(realpath "$2")
runtime=$(command -v podman || command -v docker)

# The index script reads the key's fingerprint from the GNUPGHOME it is given.
# shellcheck disable=SC2016 # Expanded inside the container.
"$runtime" run --rm -v "$site:/site:Z" -v "$gnupg:/gnupg:Z" -v "$here:/scripts:ro,Z" \
  -e GNUPGHOME=/gnupg docker.io/library/debian:13 bash -c '
    set -euo pipefail
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -qq -y apt-utils createrepo-c gpg >/dev/null
    REPOSITORY_KEY=$(gpg --batch --list-secret-keys --with-colons | awk -F: "/^fpr/ { print \$10; exit }")
    export REPOSITORY_KEY
    bash /scripts/index.sh /site'
