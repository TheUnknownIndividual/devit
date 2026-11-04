// Serves the builder app itself at its own host (a Workers custom domain, so Cloudflare makes the DNS record).
// Cloudflare won't let a Worker fetch a bare IP, so requests reach the origin through a host that already points at
// the server (ORIGIN_VIA), under a path prefix the server's Caddy only accepts with the EDGE_SECRET header.
// Cookies pass both ways: the builder's session lives on the builder's host.

interface Env {
  ORIGIN_VIA: string;
  EDGE_SECRET: string;
}

const PREFIX = "/__sitesmith";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = new Headers(req.headers);
    headers.set("x-sitesmith-edge", env.EDGE_SECRET);
    headers.set("x-sitesmith-ip", req.headers.get("cf-connecting-ip") ?? "");
    headers.set("x-forwarded-proto", "https");
    const upstream = await fetch(`${env.ORIGIN_VIA}${PREFIX}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
    });
    const res = new Response(upstream.body, upstream);
    // A redirect built from the relay host stays on the builder's own.
    const loc = res.headers.get("location");
    if (loc?.startsWith(env.ORIGIN_VIA)) res.headers.set("location", loc.slice(env.ORIGIN_VIA.length).replace(PREFIX, "") || "/");
    return res;
  },
} satisfies ExportedHandler<Env>;
