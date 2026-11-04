// Serves published sites at <slug>.<SITES_DOMAIN> and at customers' own domains (Cloudflare for SaaS custom hostnames,
// with this Worker on a */* route as their origin).
// Every request is forwarded to the builder origin with the visitor's host attached (signed with EDGE_SECRET);
// the origin's proxy maps the host to the site (unknown hosts are a 404) and refuses anything a site doesn't need.
// Pages are cached at the edge for 30 s and build assets for a year, so a burst of visitors costs the origin one render.
// Private sites (the origin marks them noindex) are never cached, and only their access cookie (ss_s_*) passes.

interface Env {
  ORIGIN: string;
  SITES_DOMAIN: string;
  EDGE_SECRET: string;
}

const PAGE_TTL = 30;
const ACCESS = /^ss_s_[a-z0-9-]+$/;

/** Only the site access cookies, never the builder's session. */
const accessCookies = (h: string | null) => (h ?? "").split(/;\s*/).filter((c) => ACCESS.test(c.split("=")[0])).join("; ");

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const host = url.hostname.toLowerCase();
    // The route also catches the builder's own host (and www, and the bare domain) when they share the zone: let those through.
    if (host === new URL(env.ORIGIN).hostname || host === `www.${env.SITES_DOMAIN}` || host === env.SITES_DOMAIN) return fetch(req);

    const isPage = url.pathname === "/";
    // Wallet logos in public/wallets keep their names, so they cache like build assets.
    const isAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/wallets/");
    const cacheable = req.method === "GET" && (isPage || isAsset);
    const key = new Request(`https://${host}${url.pathname}${url.search}`);
    if (cacheable) {
      const hit = await caches.default.match(key);
      if (hit) return hit;
    }

    const headers = new Headers(req.headers);
    const cookie = accessCookies(req.headers.get("cookie"));
    if (cookie) headers.set("cookie", cookie);
    else headers.delete("cookie");
    headers.set("x-sitesmith-host", host);
    headers.set("x-sitesmith-edge", env.EDGE_SECRET);
    headers.set("x-forwarded-proto", "https");
    const upstream = await fetch(new URL(url.pathname + url.search, env.ORIGIN), {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
    });

    const res = new Response(upstream.body, upstream);
    const setCookies = upstream.headers.getSetCookie().filter((c) => ACCESS.test(c.split("=")[0]));
    res.headers.delete("set-cookie");
    for (const c of setCookies) res.headers.append("set-cookie", c);
    const isPrivate = /noindex/i.test(upstream.headers.get("x-robots-tag") ?? "");
    if (cacheable && upstream.status === 200 && !isPrivate && !setCookies.length) {
      res.headers.set("cache-control", isAsset ? "public, max-age=31536000, immutable" : `public, max-age=0, s-maxage=${PAGE_TTL}`);
      ctx.waitUntil(caches.default.put(key, res.clone()));
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
