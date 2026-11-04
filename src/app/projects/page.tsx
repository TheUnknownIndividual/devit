import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Plus } from "lucide-react";
import { TopBar } from "@/components/account/TopBar";
import { ProjectList, type ProjectRow } from "@/components/projects/ProjectList";
import { SignInNudge } from "@/components/projects/SignInNudge";
import { myProjects, viewer } from "@/lib/accounts";
import { siteUrl } from "@/lib/sites";
import { displayName } from "@/lib/spec";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects · sitesmith" };

function ago(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default async function Projects() {
  const v = await viewer();
  const rows: ProjectRow[] = (await myProjects(v)).map((p) => ({
    id: p.id,
    title: displayName(p),
    ticker: p.spec?.ticker || null,
    logo: p.spec?.logo || p.spec?.token?.logo || null,
    chain: p.network.chain,
    edited: ago(p.updatedAt),
    liveUrl: p.published ? siteUrl(p.published.slug) : null,
    status: p.status,
    prompt: p.prompt,
  }));
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar><Link href="/" className="btn btn-primary"><Plus size={15} /> <span className="hidden sm:inline">New site</span></Link></TopBar>
      <main className="mx-auto max-w-[1040px] px-5 pb-20 pt-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">Projects</h1>
        {!v.user && <SignInNudge count={rows.length} />}
        {rows.length === 0 ? (
          <div className="panel mt-6 flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-[14px] text-zinc-400">Nothing built yet.</p>
            <Link href="/" className="btn btn-outline">Build your first site <ArrowRight size={15} /></Link>
          </div>
        ) : (
          <ProjectList rows={rows} />
        )}
      </main>
    </div>
  );
}
