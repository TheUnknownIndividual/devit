#!/bin/sh
# Starts (or restarts) the devit.lol Cloudflare tunnel connector on the server. Copy the tunnel's install command
# (or just its token) in the Cloudflare dashboard first; the token goes from the clipboard to a 600 env file on the
# server and is never printed.
set -e
TOKEN=$(pbpaste | grep -oE 'eyJ[A-Za-z0-9_=+/-]{40,}' | head -1)
[ -n "$TOKEN" ] || { echo "No tunnel token on the clipboard. Click the copy button in the dashboard first."; exit 1; }
printf 'TUNNEL_TOKEN=%s\n' "$TOKEN" | ssh root@your-server 'umask 077; cat > /root/sitesmith/devit-tunnel.env
docker rm -f devit-tunnel >/dev/null 2>&1 || true
docker run -d --name devit-tunnel --network sitesmith_default --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 --env-file /root/sitesmith/devit-tunnel.env \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run >/dev/null
sleep 6; docker ps --filter name=devit-tunnel --format "{{.Names}} {{.Status}}"
docker logs --tail 20 devit-tunnel 2>&1 | grep -oE "Registered tunnel connection[^ ]* connIndex=[0-9]+|ERR.*" | head -4'
