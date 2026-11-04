# sites Worker

Serves published sites at `<slug>.<SITES_DOMAIN>` from Cloudflare. Pages are cached at the edge for 30 s, build assets for a year.

## Set up (once)

1. Add the sites domain as a zone in Cloudflare. Add a proxied DNS record `*` → `192.0.2.1` (the Worker answers, the IP is never used).
2. In `wrangler.jsonc`, replace `example.xyz` with the domain and set `ORIGIN` to where the builder runs.
3. Pick a long random secret. Put it in the builder env as `EDGE_SECRET`, and in the Worker:
   ```
   cd edge && npx wrangler secret put EDGE_SECRET
   ```
4. Set `SITES_DOMAIN` in the builder env to the same domain and restart it.
5. Deploy: `cd edge && npx wrangler deploy`.

## Check it

Publish a site as `demo`, then:

```
curl -sI https://demo.<domain>/ | grep -i -E 'HTTP|cf-cache-status'
```

The first request shows `cf-cache-status: MISS`, a second within 30 s shows `HIT`.
`https://demo.<domain>/build/anything` returns 404: site hosts only serve the page, build assets and the public site APIs.
