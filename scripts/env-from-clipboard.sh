#!/bin/sh
# Usage: env-from-clipboard.sh NAME — writes NAME=<clipboard> into the server's sitesmith .env (replacing any old
# value). The value is never printed. Run it right after clicking a "copy" button for a secret.
set -e
NAME="$1"
echo "$NAME" | grep -qE '^[A-Z][A-Z0-9_]+$' || { echo "usage: $0 NAME"; exit 1; }
VAL=$(pbpaste | tr -d '\r\n' | sed 's/^ *//;s/ *$//')
[ -n "$VAL" ] || { echo "Clipboard is empty."; exit 1; }
printf '%s=%s\n' "$NAME" "$VAL" | ssh root@your-server "f=/root/sitesmith/.env; cp \$f \$f.bak; grep -v '^$NAME=' \$f.bak > \$f || true; cat >> \$f; chmod 600 \$f; echo \"$NAME saved (\$(grep -c '^$NAME=' \$f) line)\""
