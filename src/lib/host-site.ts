import { routing } from "./routing";
import { slugFromHost } from "./sites";
import { findBySlug } from "./store";
import { isPrivateSite } from "./site-access";
import { projectEntitled } from "./entitlements";
import { publishedUrl } from "./seo";
import type { Project, SiteSpec } from "./spec";

// Which published site a request's host is for, for the discovery files (robots, sitemap, llms.txt, OG image) that
// each site host answers itself. "builder" means the host is ours, not a site's.

export type HostSite = { kind: "builder" } | { kind: "none" } | { kind: "private"; p: Project; slug: string } | { kind: "site"; p: Project; spec: SiteSpec; url: string };

export function requestHost(req: Request): string | null {
  const h = req.headers;
  const secret = process.env.EDGE_SECRET;
  const viaEdge = !!secret && h.get("x-sitesmith-edge") === secret;
  return ((viaEdge && h.get("x-sitesmith-host")) || h.get("host"))?.toLowerCase().split(":")[0].replace(/\.$/, "") || null;
}

export async function siteForHost(req: Request): Promise<HostSite> {
  const host = requestHost(req);
  let slug = slugFromHost(host);
  let via: "host" | "custom" = "host";
  if (!slug && host) {
    const r = (await routing()).hosts[host];
    if (!r) return { kind: "builder" };
    if (!r.slug) return { kind: "none" };
    slug = r.slug;
    via = "custom";
  }
  if (!slug) return { kind: "builder" };
  const p = await findBySlug(slug);
  const spec = p?.publishedSpec ?? p?.spec;
  if (!p || !spec) return { kind: "none" };
  if (via === "custom" && !(await projectEntitled(p, "customDomain"))) return { kind: "none" };
  if (isPrivateSite(p)) return { kind: "private", p, slug };
  return { kind: "site", p, spec, url: publishedUrl(p, via, host) };
}
