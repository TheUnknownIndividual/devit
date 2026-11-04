# sites Worker

Serves published sites at `<slug>.<SITES_DOMAIN>`, and Pro sites at their own custom domain, from Cloudflare. Pages are cached at the edge for 30 s, build assets for a year.

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

## Custom domains (Pro)

Customers point their domain at `CUSTOM_DOMAIN_TARGET` (default `sites.<SITES_DOMAIN>`) and prove it's theirs with a TXT
record at `_sitesmith.<domain>`; the builder checks both over DNS-over-HTTPS. The domain only routes once the TXT is seen.

1. In the sites zone, turn on **SSL/TLS → Custom Hostnames** (Cloudflare for SaaS).
2. Add a proxied record for the fallback origin, e.g. `AAAA fallback` → `100::`, and set it as the **Fallback Origin**
   on the Custom Hostnames page.
3. Add the target customers CNAME to: proxied `CNAME sites` → `fallback.<SITES_DOMAIN>`. Put the same name in the builder
   env as `CUSTOM_DOMAIN_TARGET` (leave it empty to use `sites.<SITES_DOMAIN>`).
4. Make this Worker the origin of every custom hostname: in `wrangler.jsonc` swap the wildcard route for the `*/*`
   route on the same zone, then `npx wrangler deploy`. The Worker still passes the builder host, `www` and the bare
   domain straight through.
5. For automatic hostnames and certificates, make an API token with **Zone → SSL and Certificates → Edit** on the sites
   zone and set `CF_API_TOKEN` and `CF_ZONE_ID` in the builder env. Without them, add each verified domain by hand under
   Custom Hostnames (HTTP validation); the builder shows the domain as verified and goes live once DNS points at us.

Check: `curl -sI https://<custom-domain>/` answers the site; an unknown host on the zone answers 404.
Private sites (password or private link) are never cached at the edge and send `X-Robots-Tag: noindex`.
