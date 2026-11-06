import { siteForHost } from "@/lib/host-site";
import { appOrigin } from "@/lib/seo";
import { listProjects } from "@/lib/store";
import { isPrivateSite } from "@/lib/site-access";
import { siteUrl, sitesDomain } from "@/lib/sites";

// The builder's sitemap lists its public pages and every public published site; a site's own host lists itself.
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const iso = (t: number) => new Date(t).toISOString();

function xml(urls: Array<{ loc: string; lastmod?: number; priority?: number }>) {
  const body = urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${iso(u.lastmod)}</lastmod>` : ""}${u.priority != null ? `<priority>${u.priority.toFixed(1)}</priority>` : ""}</url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" },
  });
}

export async function GET(req: Request) {
  const s = await siteForHost(req);
  if (s.kind === "site") return xml([{ loc: s.url, lastmod: s.p.published?.at ?? s.p.updatedAt, priority: 1 }]);
  if (s.kind !== "builder") return new Response("Not found", { status: 404 });
  const o = appOrigin();
  const urls: Array<{ loc: string; lastmod?: number; priority?: number }> = [
    { loc: `${o}/`, priority: 1 }, { loc: `${o}/pricing`, priority: 0.8 }, { loc: `${o}/templates`, priority: 0.7 }, { loc: `${o}/llms.txt`, priority: 0.5 },
    { loc: `${o}/privacy`, priority: 0.3 }, { loc: `${o}/terms`, priority: 0.3 },
  ];
  // Published sites only belong here once they have their own host; /s/<slug> on the builder is kept out of the index.
  if (sitesDomain()) {
    for (const p of await listProjects(5000)) {
      if (!p.published || !(p.publishedSpec ?? p.spec) || isPrivateSite(p) || (p.publishedSpec ?? p.spec)?.token?.demo) continue;
      urls.push({ loc: siteUrl(p.published.slug), lastmod: p.published.at, priority: 0.6 });
    }
  }
  return xml(urls);
}
