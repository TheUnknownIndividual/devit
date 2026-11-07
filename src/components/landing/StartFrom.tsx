"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, ChevronDown, Info, Loader2, Lock, Search, X } from "lucide-react";
import { BrandIcon, BRANDS } from "@/components/brand";

// "or [Figma] [GitHub]" under the prompt box. GitHub lists the person's own repos once GitHub is linked (or takes any
// public repo link); Figma reads a file shared by link. Either one fills the build with what the repo or design says.

export type Imported = { source: "github" | "figma"; title: string; text: string; accent: string | null; image: string | null };

type RepoItem = { full: string; private: boolean; description: string | null; pushedAt: number };
type RepoList = { signedIn: boolean; connected: boolean; available: boolean; login?: string; avatar?: string; canPrivate?: boolean; repos?: RepoItem[]; error?: string };

async function readImport(body: { url: string } | { repo: string }): Promise<Imported | string> {
  const r = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = await r?.json().catch(() => null);
  return r?.ok && j?.text ? (j as Imported) : (j?.error ?? "Couldn't read that.");
}

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.stopPropagation()} className="relative flex max-h-[calc(100vh-32px)] w-full max-w-[600px] animate-rise flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <button type="button" onClick={onClose} className="btn btn-ghost btn-icon absolute right-3 top-3 z-10 h-9 w-9" aria-label="Close"><X size={18} /></button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return !t ? "" : d < 1 ? "today" : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d / 30)}mo ago` : `${Math.floor(d / 365)}y ago`;
};

function RepoSelect({ repos, value, onPick }: { repos: RepoItem[]; value: string | null; onPick: (full: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return (s ? repos.filter((r) => r.full.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s)) : repos).slice(0, 100); }, [repos, q]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`flex h-12 w-full min-w-0 items-center gap-2 rounded-[12px] border bg-ink-950 px-3.5 text-left text-[14px] transition-colors ${open ? "border-sky-400/70" : "border-white/[0.12] hover:border-white/25"}`}>
        <span className={`min-w-0 flex-1 truncate ${value ? "text-white" : "text-zinc-500"}`}>{value ?? "Select a repository"}</span>
        <ChevronDown size={17} className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[12px] border border-white/[0.12] bg-ink-850 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <label className="flex items-center gap-2 border-b border-white/[0.07] px-3">
            <Search size={14} className="shrink-0 text-zinc-500" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search repositories" aria-label="Search repositories" className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-zinc-500" />
          </label>
          <ul role="listbox" className="max-h-[260px] overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-3 text-[12.5px] text-zinc-500">No repository matches.</li>}
            {shown.map((r) => (
              <li key={r.full} role="option" aria-selected={value === r.full}>
                <button type="button" onClick={() => { onPick(r.full); setOpen(false); }} className="flex w-full min-w-0 items-start gap-2.5 px-3 py-2 text-left hover:bg-white/[0.05]">
                  <span className="mt-0.5 w-4 shrink-0">{value === r.full && <Check size={14} className="text-sky-300" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-zinc-100"><span className="truncate">{r.full}</span>{r.private && <Lock size={11} className="shrink-0 text-zinc-500" aria-label="Private" />}</span>
                    {r.description && <span className="block truncate text-[11.5px] text-zinc-500">{r.description}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-500">{ago(r.pushedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GithubDialog({ onClose, onImported }: { onClose: () => void; onImported: (i: Imported) => void }) {
  const [tab, setTab] = useState<"mine" | "url">("mine");
  const [list, setList] = useState<RepoList | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/account/github/repos", { cache: "no-store" }).then((r) => r.json()).then((j: RepoList) => { if (!live) return; setList(j); if (!j.connected) setTab((t) => (t === "mine" && !j.available ? "url" : t)); }).catch(() => { if (live) setList({ signedIn: false, connected: false, available: false }); });
    return () => { live = false; };
  }, []);

  const link = (intent: "signin" | "connect") => { window.location.href = `/api/auth/github?intent=${intent}&next=${encodeURIComponent("/?start=github")}`; };

  async function run() {
    const body = tab === "mine" ? (repo ? { repo } : null) : url.trim() ? { url: /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}` } : null;
    if (!body || busy) return;
    setBusy(true); setErr(null);
    const out = await readImport(body);
    setBusy(false);
    if (typeof out === "string") setErr(out); else { onImported(out); onClose(); }
  }

  const ready = tab === "mine" ? !!repo : !!url.trim();
  return (
    <Modal label="Import a GitHub repository" onClose={onClose}>
      <div className="min-h-0 overflow-y-auto p-6 sm:p-8">
        <span className="grid h-14 w-14 place-items-center rounded-full border border-white/15"><BrandIcon icon={BRANDS.github} size={22} color="#fff" /></span>
        <h2 className="mt-5 text-[21px] font-semibold tracking-[-0.01em] text-white">Import a GitHub repository</h2>
        <div className="mt-5 flex gap-3 rounded-[14px] border border-white/[0.1] p-4">
          <Info size={17} className="mt-0.5 shrink-0 text-zinc-400" />
          <p className="min-w-0 text-[13px] leading-relaxed text-zinc-300">
            We read the repo&apos;s description, website, topics and README, and write the site from that. Nothing is changed in the repo.
            {list?.connected && !list.canPrivate && <> Only public repos show up. <button type="button" className="text-sky-300 hover:underline" onClick={() => link("connect")}>Allow private repos</button></>}
          </p>
        </div>

        <div role="tablist" aria-label="How to import" className="mt-5 inline-flex rounded-[12px] border border-white/[0.1] p-1">
          {([["mine", "Your repositories"], ["url", "Import from URL"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setErr(null); }} className={`rounded-[9px] px-3.5 py-1.5 text-[13.5px] transition-colors ${tab === id ? "bg-white/[0.1] text-white" : "text-zinc-400 hover:text-zinc-200"}`}>{label}</button>
          ))}
        </div>

        {tab === "mine" ? (
          <div className="mt-5 min-h-[150px]">
            {!list ? (
              <p className="flex items-center gap-2 text-[13px] text-zinc-400"><Loader2 size={14} className="animate-spin" /> Looking for your repositories</p>
            ) : list.connected ? (
              <>
                <div className="flex min-w-0 items-center gap-2.5">
                  {list.avatar && <img src={list.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full border border-white/10" />}
                  <span className="truncate font-mono text-[14px] text-zinc-100">{list.login}</span>
                </div>
                <label className="mt-5 block text-[13.5px] font-medium text-zinc-200">Repository</label>
                <div className="mt-2"><RepoSelect repos={list.repos ?? []} value={repo} onPick={(r) => { setRepo(r); setErr(null); }} /></div>
                {(list.repos ?? []).length === 0 && <p className="mt-2 text-[12.5px] text-zinc-500">No repositories on this account yet.</p>}
              </>
            ) : list.available ? (
              <div className="rounded-[14px] border border-white/[0.08] bg-ink-950 p-5">
                <p className="text-[13.5px] text-zinc-200">{list.signedIn ? "Link your GitHub to pick from your repositories." : "Sign in with GitHub to pick from your repositories."}</p>
                {list.error && <p className="mt-1 text-[12.5px] text-amber-300">{list.error}</p>}
                <button type="button" className="btn btn-primary mt-4" onClick={() => link("signin")}><BrandIcon icon={BRANDS.github} size={15} color="currentColor" /> {list.signedIn ? "Link GitHub" : "Continue with GitHub"}</button>
                <p className="mt-2.5 text-[11.5px] text-zinc-500">Read-only: your profile and public repos. Or use Import from URL with any public repo.</p>
              </div>
            ) : (
              <p className="text-[13px] text-zinc-400">GitHub sign-in isn&apos;t set up here yet. Use Import from URL with any public repo.</p>
            )}
          </div>
        ) : (
          <div className="mt-5 min-h-[150px]">
            <label htmlFor="gh-url" className="block text-[13.5px] font-medium text-zinc-200">Repository URL</label>
            <input id="gh-url" autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} placeholder="github.com/you/project" spellCheck={false} autoComplete="off" className="field mt-2 h-12 w-full min-w-0 font-mono text-[13.5px]" />
            <p className="mt-2 text-[12px] text-zinc-500">Any public repo.</p>
          </div>
        )}

        {err && <p role="alert" className="mt-3 text-[12.5px] text-amber-300">{err}</p>}
        <div className="mt-6 flex justify-end">
          <button type="button" className="btn btn-primary h-11 px-5" disabled={!ready || busy} onClick={() => void run()}>{busy && <Loader2 size={15} className="animate-spin" />} Import repository</button>
        </div>
      </div>
    </Modal>
  );
}

/** The Figma mark in its own colours. */
function FigmaMark({ size = 46 }: { size?: number }) {
  return (
    <svg width={size * (38 / 57)} height={size} viewBox="0 0 38 57" aria-hidden>
      <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  );
}

function FigmaDialog({ onClose, onImported }: { onClose: () => void; onImported: (i: Imported) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true); setErr(null);
    const out = await readImport({ url: /^https?:\/\//.test(u) ? u : `https://${u}` });
    setBusy(false);
    if (typeof out === "string") setErr(out); else { onImported(out); onClose(); }
  }
  return (
    <Modal label="Import from Figma" onClose={onClose}>
      <div className="relative h-[150px] shrink-0 border-b border-white/[0.1]" style={{ background: "linear-gradient(100deg, #3a1b1b 0%, #4a2148 30%, #2b2f5c 55%, #183c40 80%, #1b2a22 100%)" }}>
        <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "linear-gradient(90deg, #f24e1e, #a259ff, #1abcfe, #0acf83)" }} />
        <span className="absolute bottom-0 left-1/2 grid h-[92px] w-[92px] -translate-x-1/2 translate-y-1/2 place-items-center rounded-[22px] border border-white/10 bg-black"><FigmaMark /></span>
      </div>
      <div className="min-h-0 overflow-y-auto px-6 pb-7 pt-16 text-center sm:px-10">
        <h2 className="text-[20px] font-semibold text-white">Import from Figma</h2>
        <p className="mx-auto mt-2 max-w-[440px] text-[13.5px] leading-relaxed text-zinc-400">Paste the link to a Figma file. We read its name and preview, and the site picks up its main colour.</p>
        <div className="mx-auto mt-5 flex max-w-[460px] flex-wrap gap-2">
          <input autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} placeholder="figma.com/design/…" aria-label="Figma file link" spellCheck={false} autoComplete="off" className="field h-11 min-w-0 flex-1 basis-[220px] font-mono text-[13px]" />
          <button type="button" className="btn btn-primary h-11 px-5" disabled={!url.trim() || busy} onClick={() => void run()}>{busy && <Loader2 size={15} className="animate-spin" />} Import design</button>
        </div>
        {err ? <p role="alert" className="mt-3 text-[12.5px] text-amber-300">{err}</p> : (
          <p className="mx-auto mt-3 max-w-[440px] text-[12px] text-zinc-500">In Figma, press Share, set the link to <span className="text-zinc-300">Anyone with the link can view</span>, then Copy link. <a href="https://help.figma.com/hc/en-us/articles/360040531773" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-zinc-300 hover:underline">How <ArrowUpRight size={11} /></a></p>
        )}
      </div>
    </Modal>
  );
}

export function StartFrom({ onImported }: { onImported: (i: Imported) => void }) {
  const [open, setOpen] = useState<"github" | "figma" | null>(null);
  const close = useCallback(() => setOpen(null), []);
  // Back from linking GitHub: reopen the repo picker.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("start") === "github") {
      setOpen("github");
      u.searchParams.delete("start");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
  }, []);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
      <span className="text-[14px] text-zinc-500">or</span>
      <button type="button" onClick={() => setOpen("figma")} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.12] px-4 text-[14px] text-zinc-200 transition-colors hover:border-white/25 hover:bg-white/[0.04] hover:text-white">
        <BrandIcon icon={BRANDS.figma} size={15} color="currentColor" /> Figma
      </button>
      <button type="button" onClick={() => setOpen("github")} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.12] px-4 text-[14px] text-zinc-200 transition-colors hover:border-white/25 hover:bg-white/[0.04] hover:text-white">
        <BrandIcon icon={BRANDS.github} size={15} color="currentColor" /> GitHub
      </button>
      {open === "github" && <GithubDialog onClose={close} onImported={onImported} />}
      {open === "figma" && <FigmaDialog onClose={close} onImported={onImported} />}
    </div>
  );
}
