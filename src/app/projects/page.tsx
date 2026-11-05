import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Plus } from "lucide-react";
import { TopBar } from "@/components/account/TopBar";
import { ProjectList, type ProjectRow } from "@/components/projects/ProjectList";
import { SignInNudge } from "@/components/projects/SignInNudge";
import { WorkspaceSwitcher } from "@/components/projects/WorkspaceSwitcher";
import { viewer } from "@/lib/accounts";
import { myProjects } from "@/lib/access";
import { teamActive } from "@/lib/entitlements";
import { roleIn, teamsOf } from "@/lib/teams";
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

export default async function Projects({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const v = await viewer();
  const { w } = await searchParams;
  const teams = v.user ? await teamsOf(v.user.id) : [];
  const team = teams.find((t) => t.id === w) ?? null;
  const me = v.user?.id;
  const rows: ProjectRow[] = (await myProjects(v, team?.id)).map(({ p, access }) => ({
    id: p.id,
    title: displayName(p),
    ticker: p.spec?.ticker || null,
    logo: p.spec?.logo || p.spec?.token?.logo || null,
    chain: p.network.chain,
    edited: ago(p.updatedAt),
    liveUrl: p.published ? siteUrl(p.published.slug) : null,
    status: p.status,
    prompt: p.prompt,
    access,
    mine: !!me && p.ownerId === me,
  }));
  const lapsed = team ? !(await teamActive(team)) : false;
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar>
        {v.user && <WorkspaceSwitcher current={team?.id ?? null} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />}
      </TopBar>
      <main className="mx-auto max-w-[1040px] px-5 pb-20 pt-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-[24px] font-semibold tracking-[-0.02em] text-white">{team ? team.name : "Projects"}</h1>
          <Link href="/#start" className="btn btn-primary shrink-0"><Plus size={15} /> New project</Link>
        </div>
        {!v.user && <SignInNudge count={rows.length} />}
        {lapsed && <p className="mt-3 rounded-[12px] border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-[13px] text-amber-200">This team&apos;s plan has run out. Everyone can still open its projects; only each project&apos;s own owner can change it until the owner renews.</p>}
        {rows.length === 0 ? (
          <div className="panel mt-6 flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-[14px] text-zinc-400">{team ? "No projects in this team yet. Move one in from Personal with its ⋯ menu." : "Nothing built yet."}</p>
            {!team && <Link href="/" className="btn btn-outline">Build your first site <ArrowRight size={15} /></Link>}
          </div>
        ) : (
          <ProjectList
            rows={rows}
            current={team ? { id: team.id, owner: team.ownerId === me } : null}
            teams={teams.filter((t) => { const r = roleIn(t, me); return r === "owner" || r === "editor"; }).map((t) => ({ id: t.id, name: t.name }))}
          />
        )}
      </main>
    </div>
  );
}
