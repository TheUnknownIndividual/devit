import { NextResponse, type NextRequest } from "next/server";
import { SITE_API, sitesDomain, slugFromHost } from "@/lib/sites";
import { routing } from "@/lib/routing";

// Published sites on their own host: <slug>.<SITES_DOMAIN>/ or a verified custom domain renders /s/<slug>.
// The Cloudflare Worker forwards the visitor's host in x-sitesmith-host, signed with EDGE_SECRET;
// a direct host (no Worker) is read from the Host header. A host the Worker sends that we don't know is a 404.
// Private sites get noindex on every host, and a ?k= private link is traded for a cookie at /api/site-access.

const NOT_FOUND = () => new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
const hostOf = (h: string | null) => h?.toLowerCase().split(":")[0].replace(/\.$/, "") || null;

async function sitePage(req: NextRequest, slug: string, via: "host" | "custom" | null) {
  const priv = (await routing()).private[slug];
  const k = req.nextUrl.searchParams.get("k");
  if (priv?.mode === "link" && k) {
    const to = new URL(req.nextUrl);
    to.searchParams.delete("k");
    // A rewritten route handler sees the original URL, so the link travels in a header.
    const h = new Headers(req.headers);
    h.set("x-sitesmith-access", new URLSearchParams({ slug, k, to: `${via ? "/" : to.pathname}${to.search}` }).toString());
    return NextResponse.rewrite(new URL("/api/site-access", req.url), { request: { headers: h } });
  }
  const h = new Headers(req.headers);
  h.delete("x-sitesmith-via");
  if (via) h.set("x-sitesmith-via", via);
  const res = via ? NextResponse.rewrite(new URL(`/s/${slug}`, req.url), { request: { headers: h } }) : NextResponse.next({ request: { headers: h } });
  if (priv) {
    res.headers.set("x-robots-tag", "noindex, nofollow");
    res.headers.set("cache-control", "private, no-store");
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const secret = process.env.EDGE_SECRET;
  const viaEdge = !!secret && req.headers.get("x-sitesmith-edge") === secret;
  const host = hostOf((viaEdge && req.headers.get("x-sitesmith-host")) || req.headers.get("host"));
  const path = req.nextUrl.pathname;
  let slug = slugFromHost(host);
  let via: "host" | "custom" | null = slug ? "host" : null;
  if (!slug && host) {
    const r = (await routing()).hosts[host];
    if (r) {
      if (!r.slug) return NOT_FOUND();
      slug = r.slug;
      via = "custom";
    } else {
      const d = sitesDomain();
      if (viaEdge && (!d || (host !== d && !host.endsWith(`.${d}`)))) return NOT_FOUND();
    }
  }

  if (!slug) {
    const m = /^\/s\/([a-z0-9-]{3,32})\/?$/.exec(path);
    return m ? sitePage(req, m[1], null) : NextResponse.next();
  }
  if (path === "/") return sitePage(req, slug, via);
  if (path.startsWith("/_next/") || path.startsWith("/wallets/") || SITE_API.test(path) || path === "/favicon.ico" || path === "/robots.txt") return NextResponse.next();
  return NOT_FOUND();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
