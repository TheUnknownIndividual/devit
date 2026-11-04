// Serves published sites at <slug>.<SITES_DOMAIN>.
// Every request is forwarded to the builder origin with the visitor's host attached (signed with EDGE_SECRET);
// the origin's proxy maps the host to the site and refuses anything a site doesn't need.
// Pages are cached at the edge for 30 s and build assets for a year, so a burst of visitors costs the origin one render.

interface Env {
  ORIGIN: string;
  SITES_DOMAIN: string;
  EDGE_SECRET: string;
}

const PAGE_TTL = 30;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith(`.${env.SITES_DOMAIN}`)) return new Response("Not found", { status: 404 });
    // The wildcard route also catches the builder's own host (and www) when they share the domain: let those through.
    if (host === new URL(env.ORIGIN).hostname || host === `www.${env.SITES_DOMAIN}`) return fetch(req);

    const isPage = url.pathname === "/";
    const isAsset = url.pathname.startsWith("/_next/static/");
    const cacheable = req.method === "GET" && (isPage || isAsset);
    const key = new Request(`https://${host}${url.pathname}${url.search}`);
    if (cacheable) {
      const hit = await caches.default.match(key);
      if (hit) return hit;
    }

    const headers = new Headers(req.headers);
    headers.delete("cookie");
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
    res.headers.delete("set-cookie");
    if (cacheable && upstream.status === 200) {
      res.headers.set("cache-control", isAsset ? "public, max-age=31536000, immutable" : `public, max-age=0, s-maxage=${PAGE_TTL}`);
      ctx.waitUntil(caches.default.put(key, res.clone()));
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
