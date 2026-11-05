#!/bin/sh
# Usage: apple-key.sh <KEY_ID>  — finds ~/Downloads/AuthKey_<KEY_ID>.p8 and writes APPLE_KEY_ID and APPLE_PRIVATE_KEY
# (newlines escaped) into the server's sitesmith .env. The key is never printed.
set -e
KID="$1"; F="$HOME/Downloads/AuthKey_$KID.p8"
echo "$KID" | grep -qE '^[A-Z0-9]{10}$' || { echo "usage: $0 KEY_ID (10 letters/digits)"; exit 1; }
[ -f "$F" ] || { echo "Not found: $F"; exit 1; }
KEY=$(awk 'NF{printf "%s\\n", $0}' "$F")
printf 'APPLE_KEY_ID=%s\nAPPLE_PRIVATE_KEY=%s\n' "$KID" "$KEY" | ssh root@your-server 'f=/root/sitesmith/.env; cp $f $f.bak; grep -vE "^APPLE_(KEY_ID|PRIVATE_KEY)=" $f.bak > $f || true; cat >> $f; chmod 600 $f; echo "Apple key saved: $(grep -cE "^APPLE_(KEY_ID|PRIVATE_KEY)=" $f) lines"'
