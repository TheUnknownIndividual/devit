import { NextResponse, type NextRequest } from "next/server";
import { SITE_API, slugFromHost } from "@/lib/sites";

// Published sites on their own subdomain: <slug>.<SITES_DOMAIN>/ renders /s/<slug>.
// The Cloudflare Worker forwards the visitor's host in x-sitesmith-host, signed with EDGE_SECRET;
// a direct wildcard host (no Worker) is read from the Host header.

export function proxy(req: NextRequest) {
  const secret = process.env.EDGE_SECRET;
  const viaEdge = !!secret && req.headers.get("x-sitesmith-edge") === secret;
  const slug = slugFromHost((viaEdge && req.headers.get("x-sitesmith-host")) || req.headers.get("host"));
  if (!slug) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (path === "/") return NextResponse.rewrite(new URL(`/s/${slug}`, req.url));
  if (path.startsWith("/_next/") || path.startsWith("/wallets/") || SITE_API.test(path) || path === "/favicon.ico" || path === "/robots.txt") return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
