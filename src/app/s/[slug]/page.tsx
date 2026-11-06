import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Site } from "@/blocks/Site";
import { findBySlug } from "@/lib/store";
import { siteCredit } from "@/lib/credit";
import { isPrivateSite, siteGate } from "@/lib/site-access";
import { projectEntitled } from "@/lib/entitlements";
import type { Project } from "@/lib/spec";
import { JsonLd } from "@/components/JsonLd";
import { publishedUrl, siteDescription, siteJsonLd } from "@/lib/seo";
import { recordVisit } from "@/lib/visits";

// A published site. Locally it lives at /s/<slug>; the Cloudflare Worker serves the same page at <slug>.<domain>
// and at a verified custom domain. The proxy says which (x-sitesmith-via) and adds noindex for private sites.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string; from?: string }> };

/** The project, when this host may serve it: a custom domain needs its owner still on a plan that has them. */
async function load(slug: string): Promise<{ p: Project; via: string | null; url: string } | null> {
  const p = await findBySlug(slug);
  if (!p || !(p.publishedSpec ?? p.spec)) return null;
  const h = await headers();
  const via = h.get("x-sitesmith-via");
  if (via === "custom" && !(await projectEntitled(p, "customDomain"))) return null;
  const secret = process.env.EDGE_SECRET;
  const host = ((secret && h.get("x-sitesmith-edge") === secret && h.get("x-sitesmith-host")) || h.get("host"))?.toLowerCase().split(":")[0] ?? null;
  return { p, via, url: publishedUrl(p, via, host) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const l = await load(slug);
  if (!l) return {};
  const spec = (l.p.publishedSpec ?? l.p.spec)!;
  const robots = isPrivateSite(l.p) ? { index: false, follow: false } : undefined;
  if ((await siteGate(l.p, slug)) !== "open") return { title: "Private site", robots };
  const title = `${spec.name} ($${spec.ticker})`;
  const description = siteDescription(spec, 160);
  // The share image is served by the site's own host, so it works on a subdomain and on a custom domain alike.
  const og = l.via ? `${l.url}/og/${slug}` : `/og/${slug}`;
  return {
    title,
    description,
    applicationName: spec.name,
    keywords: [spec.name, `$${spec.ticker}`, `${spec.ticker} token`, `buy ${spec.ticker}`, spec.token?.address ?? ""].filter(Boolean),
    icons: spec.token?.logo && /^https:/.test(spec.token.logo) ? { icon: spec.token.logo } : undefined,
    alternates: { canonical: l.url, ...(l.via ? { types: { "text/plain": `${l.url}/llms.txt` } } : {}) },
    openGraph: { type: "website", siteName: spec.name, title, description, url: l.url, images: [{ url: og, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
    robots: robots ?? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  };
}

export default async function Published({ params, searchParams }: Props) {
  const { slug } = await params;
  const l = await load(slug);
  if (!l) notFound();
  const gate = await siteGate(l.p, slug);
  if (gate === "link") notFound();
  if (gate === "password") return <PasswordGate slug={slug} to={l.via ? "/" : `/s/${slug}`} error={(await searchParams).e} />;
  const spec = (l.p.publishedSpec ?? l.p.spec)!;
  // "Open" in the builder's Publish dialog adds ?from=builder, so the owner checking their own site isn't counted.
  if ((await searchParams).from !== "builder") await countVisit(l.p.id);
  return (
    <>
      <Site spec={spec} mode="live" walletconnect={l.p.integrations.walletconnectProjectId ?? null} privy={l.p.integrations.privyAppId ?? null} credit={await siteCredit(l.p)} />
      {!isPrivateSite(l.p) && <JsonLd data={siteJsonLd(spec, l.url)} />}
    </>
  );
}

/**
 * One page view for the site's visit counts (lib/visits.ts): not for prefetches, in-app router requests, or the
 * owner opening it from the builder. The IP only feeds an in-memory hash; it's never stored.
 */
async function countVisit(projectId: string) {
  const h = await headers();
  if (h.get("rsc") || h.get("next-router-prefetch") || /prefetch|prerender/i.test(h.get("sec-purpose") ?? h.get("purpose") ?? "")) return;
  const referer = h.get("referer");
  if (referer) {
    try { if (/^\/(build|preview|live|projects)\//.test(new URL(referer).pathname)) return; } catch { /* not a URL: count it as direct */ }
  }
  const secret = process.env.EDGE_SECRET;
  const host = ((secret && h.get("x-sitesmith-edge") === secret && h.get("x-sitesmith-host")) || h.get("host"))?.toLowerCase().split(":")[0] ?? null;
  const ip = h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  recordVisit({ projectId, ip, ua: h.get("user-agent"), referer, host });
}

function PasswordGate({ slug, to, error }: { slug: string; to: string; error?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 p-4">
      <form method="post" action="/api/site-access" className="w-full max-w-[360px] rounded-2xl border border-white/10 bg-ink-900 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-zinc-300"><Lock size={15} /></span>
          <h1 className="text-[15px] font-semibold text-white">This site is private</h1>
        </div>
        <p className="mt-3 text-[12.5px] text-zinc-400">Enter the password you were given.</p>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="to" value={to} />
        <input type="password" name="password" required autoFocus autoComplete="current-password" aria-label="Password" className="mt-3 h-10 w-full rounded-[10px] border border-white/10 bg-white/[0.04] px-3 text-[13px] text-white outline-none focus:border-sel/60" />
        {error && <p className="mt-2 text-[12px] text-amber-300">{error === "wait" ? "Too many tries. Wait a while and try again." : "That password isn't right."}</p>}
        <button type="submit" className="btn btn-primary mt-4 w-full justify-center">Open site</button>
      </form>
    </main>
  );
}
