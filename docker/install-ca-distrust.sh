#!/bin/sh
# SPDX-License-Identifier: MIT
set -eu

db="$HOME/.local/share/pki/nssdb"
if [ -e "$HOME/.pki/nssdb/cert9.db" ]; then
    db="$HOME/.pki/nssdb"
fi
mkdir -p "$db"
if [ ! -e "$db/cert9.db" ]; then
    certutil -N -d "sql:$db" --empty-password
fi
for certificate in /usr/share/fuba-browser/blocked-ca/*.pem; do
    nickname="fuba-browser-distrust-$(basename "$certificate" .pem)"
    certutil -A -d "sql:$db" -n "$nickname" -t 'p,p,p' -i "$certificate"
done
