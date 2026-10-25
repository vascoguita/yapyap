#!/usr/bin/env bash
# Builds and signs the pacman repositories of the package site (#350).
#
# Usage: index-pacman.sh <site directory>
#
# Like index.sh, it reads the plan in .plan/ and the packages under
# pool/<tag>/, and REPOSITORY_KEY names the signing key in GNUPGHOME. Needs
# repo-add and gpg, so it runs on Arch Linux.
set -euo pipefail

site=$(realpath "$1")
key=${REPOSITORY_KEY:?REPOSITORY_KEY must name the signing key}
cd "$site"

pacman_channel() {
  local channel=$1
  shift
  local repo="arch/$channel/x86_64"
  rm -rf "$repo"
  mkdir -p "$repo"
  local packages=()
  for tag in "$@"; do
    for package in pool/"$tag"/*.pkg.tar.zst; do
      [[ -e $package ]] || continue
      # repo-add reads each package, so it sits here until the deploy keeps
      # only its signature; the site redirects the package itself to GitHub.
      cp "$package" "$repo/"
      local copy
      copy="$repo/$(basename "$package")"
      gpg --batch --yes --local-user "$key" --detach-sign -o "$copy.sig" "$copy"
      packages+=("$copy")
    done
  done
  # A channel lists several versions, and repo-add would otherwise let an
  # older one added later replace the newest.
  repo-add --quiet --prevent-downgrade --sign --key "$key" "$repo/yapyap.db.tar.zst" "${packages[@]}"
  # Static hosts serve files, not links, so the names pacman asks for are copies.
  for name in yapyap.db yapyap.db.sig yapyap.files yapyap.files.sig; do
    cp --remove-destination "$(readlink -f "$repo/$name")" "$repo/$name"
  done
}

for channel in stable beta; do
  mapfile -t tags <".plan/$channel"
  pacman_channel "$channel" "${tags[@]}"
done
echo "Indexed the stable and beta pacman repositories, signed by $key."
