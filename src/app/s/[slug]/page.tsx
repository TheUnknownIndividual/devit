import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Site } from "@/blocks/Site";
import { findBySlug } from "@/lib/store";

// A published site. Locally it lives at /s/<slug>; the Cloudflare Worker serves the same page at <slug>.<domain>.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await findBySlug(slug);
  const spec = p?.publishedSpec ?? p?.spec;
  if (!spec) return {};
  return {
    title: `${spec.name} ($${spec.ticker})`,
    description: spec.tagline,
    icons: spec.token?.logo && /^https:/.test(spec.token.logo) ? { icon: spec.token.logo } : undefined,
  };
}

export default async function Published({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await findBySlug(slug);
  const spec = p?.publishedSpec ?? p?.spec;
  if (!p || !spec) notFound();
  return <Site spec={spec} mode="live" walletconnect={p.integrations.walletconnectProjectId ?? null} />;
}
