import Link from "next/link";
import { ArrowRight, Globe, Plus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ChainIcon } from "@/components/brand";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { listProjects } from "@/lib/store";
import { CHAINS } from "@/lib/spec";

export const dynamic = "force-dynamic";

function ago(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default async function Projects() {
  const projects = await listProjects();
  return (
    <div className="min-h-screen bg-ink-950">
      <header className="mx-auto flex h-16 max-w-[1040px] items-center justify-between px-5">
        <Logo />
        <Link href="/" className="btn btn-primary"><Plus size={15} /> New site</Link>
      </header>
      <main className="mx-auto max-w-[1040px] px-5 pb-20 pt-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">My sites</h1>
        {projects.length === 0 ? (
          <div className="panel mt-6 flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-[14px] text-zinc-400">Nothing built yet.</p>
            <Link href="/" className="btn btn-outline">Build your first site <ArrowRight size={15} /></Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/build/${p.id}`} className="flex h-16 items-center gap-4 px-4 hover:bg-white/[0.03]">
                  {p.spec ? <ThemeSwatch id={p.spec.theme.id} size={28} /> : <span className="h-7 w-7 rounded-md bg-white/5" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-white">{p.spec?.name ?? "Building…"}{p.spec?.ticker ? <span className="ml-2 text-zinc-500">${p.spec.ticker}</span> : null}</div>
                    <div className="truncate text-[12px] text-zinc-500">{p.prompt}</div>
                  </div>
                  <span className="hidden items-center gap-1.5 text-[12px] text-zinc-400 sm:flex"><ChainIcon chain={p.network.chain} size={13} /> {CHAINS[p.network.chain].name}</span>
                  {p.published && <span className="hidden items-center gap-1.5 text-[12px] text-lime sm:flex"><Globe size={13} /> {p.published.slug}</span>}
                  <span className="w-16 text-right text-[12px] text-zinc-500">{ago(p.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
