#!/bin/sh
# SPDX-License-Identifier: MIT
set -eu

version=156.0.8078.80
case "$(dpkg --print-architecture)" in
    amd64)
        platform=linux64
        checksum=b711c720f774be355197f32edf37e0651418ba036d92446ee2da19ac017540a7
        ;;
    arm64)
        platform=linux-arm64
        checksum=1f496a826c9ba4d6a5f5bf2de686145fe718528c2cc3dbeb96b5893b89653724
        ;;
    *) echo 'Unsupported Chrome for Testing architecture' >&2; exit 1 ;;
esac

archive=$(mktemp)
directory=$(mktemp -d)
trap 'rm -f "$archive"; rm -rf "$directory"' EXIT
wget -q -O "$archive" "https://storage.googleapis.com/chrome-for-testing-public/$version/$platform/chrome-$platform.zip"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum -c -
unzip -q "$archive" -d "$directory"
mkdir -p /opt/chrome
cp -a "$directory/chrome-$platform/." /opt/chrome/
chmod -R a+rX /opt/chrome
/opt/chrome/chrome --version | grep -F "$version"
