"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Download, Loader2, LogIn, RefreshCw } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { BRANDS, BrandIcon } from "@/components/brand";
import { openSignIn, refreshSession, useSession } from "@/components/account/session";
import { Switch } from "@/components/settings/KeyRow";
import type { PublicProject } from "@/lib/public";

// Export code, bolt.new's way: connect GitHub once, name the repo, push. After that the same repo gets a new commit
// on each push. The zip is the same Next.js app for anyone who'd rather not use GitHub.

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString();
};
const slug = (p: PublicProject) => `${(p.spec?.name || p.title || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "site"}-site`;

export function ExportDialog({ open, onClose, project: p, onSaved }: { open: boolean; onClose: () => void; project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const { user } = useSession();
  const [ghOn, setGhOn] = useState<boolean | null>(null);
  const [name, setName] = useState(() => slug(p));
  const [priv, setPriv] = useState(true);
  const [busy, setBusy] = useState<null | "push" | "fresh" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!open || ghOn !== null) return;
    fetch("/api/auth/methods", { cache: "no-store" }).then((r) => r.json()).then((j: { github?: boolean }) => setGhOn(!!j.github)).catch(() => setGhOn(false));
  }, [open, ghOn]);
  useEffect(() => { if (open) setError(null); }, [open]);

  const gh = user?.github ?? null;
  const repo = p.github && gh && p.github.repo.split("/")[0].toLowerCase() === gh.login.toLowerCase() && !fresh ? p.github : null;
  const connect = () => { window.location.href = `/api/auth/github?intent=connect&next=${encodeURIComponent(`/build/${p.id}?export=1`)}`; };

  async function push() {
    setBusy(repo ? "push" : "fresh");
    setError(null);
    try {
      const r = await fetch(`/api/projects/${p.id}/github`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(repo ? {} : { name, private: priv, fresh: true }) });
      const j = (await r.json().catch(() => ({}))) as { github?: PublicProject["github"]; error?: string; connect?: boolean; gone?: boolean };
      if (!r.ok || !j.github) {
        setError(j.error ?? "That push didn't go through.");
        if (j.connect) void refreshSession();
        if (j.gone) setFresh(true);
        return;
      }
      setFresh(false);
      onSaved({ ...p, github: j.github });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    await fetch("/api/account/github", { method: "DELETE" }).catch(() => undefined);
    await refreshSession();
    setBusy(null);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Export code" icon={<BrandIcon icon={BRANDS.github} size={15} color="#e4e4e7" />} width={520}>
      <div className="space-y-5">
        <p className="text-[13px] text-zinc-400">Your site as a Next.js app: the page, its blocks and its spec. Live price, trades and cross-chain buys keep running through sitesmith, no keys needed.</p>

        <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2.5">
            <BrandIcon icon={BRANDS.github} size={18} color="#fafafa" />
            <h3 className="text-[14px] font-medium text-zinc-100">GitHub</h3>
            {gh?.canPush && <span className="ml-auto text-[12px] text-zinc-500">@{gh.login}</span>}
          </div>

          {!user ? (
            <div className="mt-3 space-y-3">
              <p className="text-[12.5px] text-zinc-500">Sign in to connect GitHub and push this site to a repo.</p>
              <button type="button" className="btn btn-outline" onClick={() => { onClose(); openSignIn(); }}><LogIn size={15} /> Sign in</button>
            </div>
          ) : ghOn === false ? (
            <p className="mt-3 text-[12.5px] text-zinc-500">GitHub isn't set up on this server yet. Download the code below instead.</p>
          ) : !gh?.canPush ? (
            <div className="mt-3 space-y-3">
              <p className="text-[12.5px] text-zinc-500">Connect your GitHub account once. sitesmith makes the repo and commits the code; it never touches your other repos.</p>
              <button type="button" className="btn btn-primary" disabled={ghOn === null} onClick={connect}><BrandIcon icon={BRANDS.github} size={15} color="currentColor" /> Connect GitHub</button>
            </div>
          ) : repo ? (
            <div className="mt-3 space-y-3">
              <a href={repo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-ink-900 px-3 py-2.5 text-[13px] text-zinc-200 hover:border-white/20">
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{repo.repo}</span>
                <span className="shrink-0 text-[12px] text-zinc-500">{repo.branch} · {repo.sha.slice(0, 7)} · {ago(repo.at)}</span>
                <ArrowUpRight size={14} className="shrink-0 text-zinc-500" />
              </a>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary" disabled={!!busy || !p.spec} onClick={() => void push()}>
                  {busy === "push" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Push changes
                </button>
                <button type="button" className="btn btn-ghost text-[12.5px]" disabled={!!busy} onClick={() => { setFresh(true); setName(slug(p)); }}>Push to a new repo</button>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-zinc-400">Repository</span>
                <div className="flex items-center rounded-lg border border-white/10 bg-ink-900 focus-within:border-white/25">
                  <span className="pl-3 font-mono text-[12.5px] text-zinc-500">{gh.login}/</span>
                  <input value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").slice(0, 100))} className="min-w-0 flex-1 bg-transparent py-2 pr-3 font-mono text-[12.5px] text-zinc-100 outline-none" spellCheck={false} aria-label="Repository name" />
                </div>
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-zinc-400">Private repo</span>
                <Switch on={priv} onChange={setPriv} label="Private repo" />
              </div>
              <button type="button" className="btn btn-primary w-full justify-center" disabled={!!busy || !name || !p.spec} onClick={() => void push()}>
                {busy === "fresh" ? <Loader2 size={15} className="animate-spin" /> : <BrandIcon icon={BRANDS.github} size={15} color="currentColor" />} Create repo and push
              </button>
            </div>
          )}
          {error && <p className="mt-3 text-[12.5px] text-red-300">{error}</p>}
          {gh?.canPush && (
            <button type="button" className="mt-3 text-[12px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline" disabled={!!busy} onClick={() => void disconnect()}>
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect GitHub"}
            </button>
          )}
        </section>

        <section className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-medium text-zinc-100">Download</h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">A zip of the same app. <span className="font-mono">npm install && npm run dev</span>.</p>
          </div>
          <a className={`btn btn-outline shrink-0 ${p.spec ? "" : "pointer-events-none opacity-50"}`} href={`/api/projects/${p.id}/export`} download><Download size={15} /> .zip</a>
        </section>
      </div>
    </Dialog>
  );
}
