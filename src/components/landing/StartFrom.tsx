"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, ChevronDown, Loader2, Lock, Search, X } from "lucide-react";
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

const withScheme = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

/** One frame for both imports: icon tile and title in a row, the body, then a footer with a hint and the action. */
function ImportDialog({ label, icon, sub, onClose, footHint, action, children }: { label: string; icon: ReactNode; sub: string; onClose: () => void; footHint?: ReactNode; action: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[calc(100vh-32px)] w-full max-w-[540px] animate-rise flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <div className="flex min-w-0 items-center gap-3.5 border-b border-white/[0.07] px-5 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-white/10 bg-ink-950">{icon}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold text-white">{label}</h2>
            <p className="truncate text-[12.5px] text-zinc-500">{sub}</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon h-9 w-9 shrink-0" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-white/[0.07] bg-ink-950/60 px-5 py-3.5">
          <div className="min-w-0 flex-1 basis-[200px] text-[12px] leading-relaxed text-zinc-500">{footHint}</div>
          {action}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return !t ? "" : d < 1 ? "today" : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d / 30)}mo ago` : `${Math.floor(d / 365)}y ago`;
};

type Place = { left: number; width: number; top?: number; bottom?: number; maxH: number };

/** The repo picker. Its list floats above the dialog (portal, fixed), so the dialog never clips or scroll-traps it. */
function RepoSelect({ repos, value, onPick }: { repos: RepoItem[]; value: string | null; onPick: (full: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState<Place | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const below = window.innerHeight - b.bottom - 12;
    const above = b.top - 12;
    const up = below < 260 && above > below;
    const maxH = Math.max(160, Math.min(360, (up ? above : below) - 6));
    setAt(up ? { left: b.left, width: b.width, bottom: window.innerHeight - b.top + 6, maxH } : { left: b.left, width: b.width, top: b.bottom + 6, maxH });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", out);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("mousedown", out); };
  }, [open, place]);

  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return (s ? repos.filter((r) => r.full.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s)) : repos).slice(0, 100); }, [repos, q]);

  return (
    <>
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`flex h-11 w-full min-w-0 items-center gap-2 rounded-[11px] border bg-ink-950 px-3.5 text-left text-[13.5px] transition-colors ${open ? "border-sky-400/70" : "border-white/[0.12] hover:border-white/25"}`}>
        <span className={`min-w-0 flex-1 truncate ${value ? "text-white" : "text-zinc-500"}`}>{value ?? "Select a repository"}</span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && at && createPortal(
        <div ref={pop} onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", left: at.left, width: at.width, top: at.top, bottom: at.bottom, maxHeight: at.maxH }} className="z-[110] flex flex-col overflow-hidden rounded-[12px] border border-white/[0.12] bg-ink-850 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
          <label className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
            <Search size={14} className="shrink-0 text-zinc-500" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); btn.current?.focus(); } }} placeholder="Search repositories" aria-label="Search repositories" className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-zinc-500" />
            <span className="shrink-0 text-[11px] text-zinc-500">{shown.length}</span>
          </label>
          <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
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
        </div>,
        document.body,
      )}
    </>
  );
}

function Segments<T extends string>({ value, items, onPick }: { value: T; items: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[11px] border border-white/[0.08] bg-ink-950 p-1">
      {items.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onPick(id)} className={`min-w-0 truncate rounded-[8px] px-3 py-1.5 text-[13px] transition-colors ${value === id ? "bg-white/[0.09] text-white" : "text-zinc-400 hover:text-zinc-200"}`}>{label}</button>
      ))}
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
    fetch("/api/account/github/repos", { cache: "no-store" }).then((r) => r.json()).then((j: RepoList) => { if (!live) return; setList(j); if (!j.connected && !j.available) setTab("url"); }).catch(() => { if (live) setList({ signedIn: false, connected: false, available: false }); });
    return () => { live = false; };
  }, []);

  const link = (intent: "signin" | "connect") => { window.location.href = `/api/auth/github?intent=${intent}&next=${encodeURIComponent("/?start=github")}`; };

  async function run() {
    const body = tab === "mine" ? (repo ? { repo } : null) : url.trim() ? { url: withScheme(url.trim()) } : null;
    if (!body || busy) return;
    setBusy(true); setErr(null);
    const out = await readImport(body);
    setBusy(false);
    if (typeof out === "string") setErr(out); else { onImported(out); onClose(); }
  }

  const ready = tab === "mine" ? !!repo : !!url.trim();
  return (
    <ImportDialog
      label="Import a GitHub repository"
      sub="Build from a repo's description, site and README"
      icon={<BrandIcon icon={BRANDS.github} size={20} color="#fff" />}
      onClose={onClose}
      footHint="Read-only. Nothing in the repo is changed."
      action={<button type="button" className="btn btn-primary h-10 px-4" disabled={!ready || busy} onClick={() => void run()}>{busy && <Loader2 size={15} className="animate-spin" />} Import repository</button>}
    >
      <Segments value={tab} items={[["mine", "Your repositories"], ["url", "Import from URL"]] as const} onPick={(t) => { setTab(t); setErr(null); }} />

      {tab === "mine" ? (
        <div className="mt-5 min-h-[120px]">
          {!list ? (
            <p className="flex items-center gap-2 text-[13px] text-zinc-400"><Loader2 size={14} className="animate-spin" /> Looking for your repositories</p>
          ) : list.connected ? (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                {list.avatar && <img src={list.avatar} alt="" className="h-6 w-6 shrink-0 rounded-full border border-white/10" />}
                <span className="min-w-0 truncate text-[13.5px] text-zinc-100">{list.login}</span>
                <span className="shrink-0 text-[12px] text-zinc-500">{(list.repos ?? []).length} repos</span>
              </div>
              <div className="mt-3"><RepoSelect repos={list.repos ?? []} value={repo} onPick={(r) => { setRepo(r); setErr(null); }} /></div>
              {!list.canPrivate && <p className="mt-2.5 text-[12px] text-zinc-500">Missing a private repo? <button type="button" className="text-sky-300 hover:underline" onClick={() => link("connect")}>Allow private repos</button></p>}
            </>
          ) : list.available ? (
            <div className="rounded-[12px] border border-white/[0.08] bg-ink-950 p-4">
              <p className="text-[13.5px] text-zinc-200">{list.signedIn ? "Link your GitHub to pick from your repositories." : "Sign in with GitHub to pick from your repositories."}</p>
              {list.error && <p className="mt-1 text-[12.5px] text-amber-300">{list.error}</p>}
              <button type="button" className="btn btn-outline mt-3" onClick={() => link("signin")}><BrandIcon icon={BRANDS.github} size={15} color="currentColor" /> {list.signedIn ? "Link GitHub" : "Continue with GitHub"}</button>
              <p className="mt-2 text-[11.5px] text-zinc-500">Asks for your profile and public repos only.</p>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">GitHub sign-in isn&apos;t set up here yet. Use Import from URL with any public repo.</p>
          )}
        </div>
      ) : (
        <div className="mt-5 min-h-[120px]">
          <label htmlFor="gh-url" className="block text-[12.5px] font-medium text-zinc-300">Repository link</label>
          <input id="gh-url" autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} placeholder="github.com/you/project" spellCheck={false} autoComplete="off" className="field mt-2 h-11 w-full min-w-0 font-mono text-[13px]" />
          <p className="mt-2 text-[12px] text-zinc-500">Any public repo.</p>
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-[12.5px] text-amber-300">{err}</p>}
    </ImportDialog>
  );
}

/** The Figma mark in its own colours. */
function FigmaMark({ size = 22 }: { size?: number }) {
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
    const out = await readImport({ url: withScheme(u) });
    setBusy(false);
    if (typeof out === "string") setErr(out); else { onImported(out); onClose(); }
  }
  return (
    <ImportDialog
      label="Import from Figma"
      sub="Build from a design's name, preview and colours"
      icon={<FigmaMark />}
      onClose={onClose}
      footHint={<a href="https://help.figma.com/hc/en-us/articles/360040531773" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-zinc-300">How sharing by link works <ArrowUpRight size={11} /></a>}
      action={<button type="button" className="btn btn-primary h-10 px-4" disabled={!url.trim() || busy} onClick={() => void run()}>{busy && <Loader2 size={15} className="animate-spin" />} Import design</button>}
    >
      <label htmlFor="fg-url" className="block text-[12.5px] font-medium text-zinc-300">Figma file link</label>
      <input id="fg-url" autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} placeholder="figma.com/design/…" spellCheck={false} autoComplete="off" className="field mt-2 h-11 w-full min-w-0 font-mono text-[13px]" />
      {err && <p role="alert" className="mt-3 text-[12.5px] text-amber-300">{err}</p>}
      <ol className="mt-5 space-y-2">
        {["In Figma, press Share on the file.", "Set the link to Anyone with the link can view.", "Copy link and paste it above."].map((s, i) => (
          <li key={s} className="flex min-w-0 items-start gap-2.5 text-[12.5px] text-zinc-400">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/10 text-[11px] text-zinc-300">{i + 1}</span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
    </ImportDialog>
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
