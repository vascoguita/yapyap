#!/usr/bin/env bash
# Checks the Homebrew casks, winget manifests and Scoop manifests the
# release workflows publish (#345, #346), for a release and for a beta,
# from stand-in checksums. The generator checks the winget and Scoop
# manifests against their schemas; Homebrew's own `brew style` and
# `brew audit` check the casks, in Homebrew's Linux container, so pull
# requests need no macOS runner.
#
# Usage: test.sh   (needs podman or docker, and Node.js 26)
set -euo pipefail

here=$(dirname "$(realpath "$0")")
root=$(realpath "$here/../..")
runtime=$(command -v docker || command -v podman)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

BREW=ghcr.io/homebrew/brew@sha256:77bda6c35c8dedcbbd7472ee566025f33aba2aebbf3af18537d67e5b3c3ca20b
SUFFIXES=(mac-universal.dmg win-x64-setup.exe win-arm64-setup.exe win-x64-portable.exe win-arm64-portable.exe)

generate() {
  local version=$1 index=0
  mkdir -p "$work/$version"
  for suffix in "${SUFFIXES[@]}"; do
    index=$((index + 1))
    printf '%064x  YapYap-%s-%s\n' "$index" "$version" "$suffix"
  done > "$work/$version/SHA256SUMS"
  node "$root/scripts/src/bin/distribution.ts" "$version" "$work/$version/SHA256SUMS" "$work/$version/out"
}

generate 10.20.30
generate 10.20.31-beta.1
mkdir -p "$work/casks/release" "$work/casks/beta"
cp "$work/10.20.30/out/homebrew/Casks/"*.rb "$work/casks/release/"
cp "$work/10.20.31-beta.1/out/homebrew/Casks/"*.rb "$work/casks/beta/"

# Homebrew loads casks only from taps, and from third-party taps only once
# they are trusted.
"$runtime" run --rm -v "$work/casks:/casks:ro,Z" -e HOMEBREW_NO_AUTO_UPDATE=1 -e HOMEBREW_NO_ANALYTICS=1 \
  "$BREW" bash -euo pipefail -c '
    brew tap-new --no-git vascoguita/yapyap > /dev/null
    brew trust vascoguita/yapyap
    tap=$(brew --repository vascoguita/yapyap)
    mkdir -p "$tap/Casks"
    for set in release beta; do
      echo "== The casks a ${set} publishes"
      cp /casks/$set/*.rb "$tap/Casks/"
      brew style --cask vascoguita/yapyap/yapyap vascoguita/yapyap/yapyap@beta
      brew audit --cask --strict vascoguita/yapyap/yapyap vascoguita/yapyap/yapyap@beta
      # Audit passes casks that print deprecation warnings on install, such
      # as the url stanza'"'"'s verified parameter in Homebrew 7 (#755); loading
      # them shows those warnings.
      warnings=$(brew info --cask vascoguita/yapyap/yapyap vascoguita/yapyap/yapyap@beta 2>&1 > /dev/null)
      if [ -n "$warnings" ]; then
        echo "$warnings" >&2
        exit 1
      fi
    done'
echo 'The Homebrew, winget and Scoop manifests pass their checks.'
