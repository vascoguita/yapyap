#!/usr/bin/env bash
# Builds and signs the apt and dnf indexes of the package site (#344).
#
# Usage: index.sh <site directory>
#
# The site must hold the plan `package-repository.ts` wrote (.plan/) and
# every planned package under pool/<tag>/. REPOSITORY_KEY names the signing
# key in GNUPGHOME. Needs apt-ftparchive, createrepo_c and gpg.
set -euo pipefail

site=$(realpath "$1")
key=${REPOSITORY_KEY:?REPOSITORY_KEY must name the signing key}
cd "$site"

sign() {
  gpg --batch --yes --local-user "$key" "$@"
}

# apt-ftparchive picks architectures by file name (`*_amd64.deb`), which
# YapYap's packages do not follow, so each list is split by its field.
# It also reads a single folder, its later arguments being an override
# file and a path prefix, so each release's folder is listed on its own.
packages_for() {
  local arch=$1
  shift
  for pool in "$@"; do
    apt-ftparchive packages "$pool"
  done |
    awk -v arch="$arch" 'BEGIN { RS = ""; ORS = "\n\n" } $0 ~ "\nArchitecture: " arch "(\n|$)"'
}

apt_channel() {
  local channel=$1
  shift
  local pools=("${@/#/pool/}")
  for arch in amd64 arm64; do
    local dir="dists/$channel/main/binary-$arch"
    mkdir -p "$dir"
    packages_for "$arch" "${pools[@]}" >"$dir/Packages"
    gzip -9 -n -f -k "$dir/Packages"
  done
  apt-ftparchive \
    -o APT::FTPArchive::Release::Origin=YapYap \
    -o APT::FTPArchive::Release::Label=YapYap \
    -o "APT::FTPArchive::Release::Suite=$channel" \
    -o "APT::FTPArchive::Release::Codename=$channel" \
    -o "APT::FTPArchive::Release::Architectures=amd64 arm64" \
    -o APT::FTPArchive::Release::Components=main \
    -o "APT::FTPArchive::Release::Description=YapYap ($channel)" \
    release "dists/$channel" >"dists/$channel/Release.new"
  mv "dists/$channel/Release.new" "dists/$channel/Release"
  sign --clearsign -o "dists/$channel/InRelease" "dists/$channel/Release"
  sign --detach-sign --armor -o "dists/$channel/Release.gpg" "dists/$channel/Release"
}

# createrepo_c lists the packages under the repository's own folder, so each
# channel links the RPMs it lists there; the site redirects those paths to
# GitHub, like apt's pool.
rpm_channel() {
  local channel=$1
  shift
  local repo="rpm/$channel"
  rm -rf "$repo"
  mkdir -p "$repo"
  for tag in "$@"; do
    for rpm in pool/"$tag"/*.rpm; do
      [[ -e $rpm ]] || continue
      mkdir -p "$repo/pool/$tag"
      ln -s "../../../../$rpm" "$repo/pool/$tag/"
    done
  done
  createrepo_c --quiet --simple-md-filenames "$repo"
  sign --detach-sign --armor -o "$repo/repodata/repomd.xml.asc" "$repo/repodata/repomd.xml"
}

for channel in stable beta; do
  mapfile -t tags <".plan/$channel"
  apt_channel "$channel" "${tags[@]}"
  rpm_channel "$channel" "${tags[@]}"
done

gpg --batch --yes --export "$key" >yapyap.gpg
gpg --batch --yes --armor --export "$key" >yapyap.asc
echo "Indexed the stable and beta channels, signed by $key."
