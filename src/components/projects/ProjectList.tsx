"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { prepareImage } from "@/components/build/attach";
import { Copy, FolderInput, FolderOutput, Globe, ImagePlus, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ChainIcon } from "@/components/brand";
import { Dialog } from "@/components/ui/Dialog";
import { Menu } from "@/components/ui/Menu";
import { CHAINS, type Chain } from "@/lib/spec";
import type { Access } from "@/lib/access";

export interface ProjectRow {
  id: string;
  title: string;
  ticker: string | null;
  logo: string | null;
  chain: Chain;
  edited: string;
  liveUrl: string | null;
  status: "building" | "ready" | "error";
  prompt: string;
  access: Access;
  /** This account owns it (not just through a team). */
  mine: boolean;
}

/** The project's own logo, or its initial on a plain tile. */
export function ProjectLogo({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)} style={{ width: size, height: size }} className="shrink-0 rounded-lg border border-white/[0.08] bg-ink-850 object-cover" />;
  return <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.42 }} className="grid shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-ink-800 font-semibold text-zinc-300">{(name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase()}</span>;
}

const host = (u: string) => u.replace(/^https?:\/\//, "");

/**
 * A project logo you can change: click to pick a picture, or drop one on it. Uploads it as a project asset, sets it
 * as the logo and hands back the saved project (or why not). Used on the Projects list and the builder header.
 */
export function LogoUpload({ projectId, src, name, size = 36, ready = true, onDone, className = "" }: { projectId: string; src: string | null; name: string; size?: number; ready?: boolean; onDone: (err: string | null, project?: unknown) => void; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  async function use(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { onDone("Drop a picture (PNG, JPG, WebP or GIF)."); return; }
    const img = await prepareImage(file);
    if ("error" in img) { onDone(img.error); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: img.blob, headers: { "x-name": file.name.slice(0, 60), "x-w": String(img.w), "x-h": String(img.h), "content-type": img.blob.type } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.asset) { onDone(j.error ?? "That picture didn't upload."); return; }
      const s = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: j.asset.url }) });
      onDone(s.ok ? null : "Couldn't set the logo.", s.ok ? await s.json().catch(() => undefined) : undefined);
    } finally { setBusy(false); }
  }
  return (
    <>
      <button
        type="button"
        title={ready ? "Change the logo: click to pick a picture, or drop one here" : "The logo can change once the site is built"}
        aria-label={`Change the logo of ${name}`}
        disabled={!ready || busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { if (ready && e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); if (ready) void use(e.dataTransfer.files[0]); }}
        className={`group/logo relative shrink-0 rounded-lg ${over ? "ring-2 ring-sel ring-offset-2 ring-offset-ink-950" : ""} ${className}`}
      >
        <ProjectLogo src={src} name={name} size={size} />
        <span className={`absolute inset-0 grid place-items-center rounded-lg bg-black/55 transition-opacity ${busy || over ? "opacity-100" : "opacity-0 group-hover/logo:opacity-100"}`}>
          {busy ? <Loader2 size={Math.round(size * 0.4)} className="animate-spin text-white" /> : <ImagePlus size={Math.round(size * 0.4)} className="text-white" />}
        </span>
      </button>
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void use(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

/** The logo on a row you can edit. */
function LogoDrop({ row, name, onDone }: { row: ProjectRow; name: string; onDone: (err: string | null) => void }) {
  return <LogoUpload projectId={row.id} src={row.logo} name={name} ready={row.status === "ready"} onDone={(e) => onDone(e)} className="ml-4" />;
}

type Pick = "rename" | "duplicate" | "delete" | `move:${string}`;

/** `current` is the team being listed (null: personal); `teams` are the ones a project of yours can move into. */
export function ProjectList({ rows, current = null, teams = [] }: { rows: ProjectRow[]; current?: { id: string; owner: boolean } | null; teams?: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ProjectRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Enter and Esc settle the edit themselves; the blur that follows must not save again.
  const settled = useRef(false);

  async function rename(id: string) {
    const name = draft.trim();
    setEditing(null);
    if (!name || name === (names[id] ?? rows.find((r) => r.id === id)?.title)) return;
    setNames((n) => ({ ...n, [id]: name }));
    const r = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!r.ok) { setNames((n) => { const { [id]: _, ...rest } = n; return rest; }); setError((await r.json().catch(() => ({}))).error ?? "Couldn't rename it."); }
    else router.refresh();
  }

  async function duplicate(id: string) {
    setBusy(id); setError(null);
    const r = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
    setBusy(null);
    if (r.ok) router.refresh(); else setError((await r.json().catch(() => ({}))).error ?? "Couldn't duplicate it.");
  }

  async function move(id: string, teamId: string | null) {
    setBusy(id); setError(null);
    const r = await fetch(`/api/projects/${id}/team`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ teamId }) });
    setBusy(null);
    if (r.ok) router.refresh(); else setError((await r.json().catch(() => ({}))).error ?? "Couldn't move it.");
  }

  async function remove(p: ProjectRow) {
    setBusy(p.id); setError(null);
    const r = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    setBusy(null); setConfirm(null);
    if (r.ok) router.refresh(); else setError((await r.json().catch(() => ({}))).error ?? "Couldn't delete it.");
  }

  return (
    <>
      {error && <p role="alert" className="mt-4 text-[12.5px] text-amber-200">{error}</p>}
      <ul className="mt-6 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-ink-900">
        {rows.map((p) => {
          const title = names[p.id] ?? p.title;
          return (
            <li key={p.id} className="group flex h-[68px] items-center gap-2 pr-2 first:rounded-t-2xl last:rounded-b-2xl hover:bg-white/[0.02]">
              {editing === p.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-4 pl-4">
                  <ProjectLogo src={p.logo} name={title} />
                  <input
                    autoFocus
                    className="field h-9 max-w-[360px]"
                    value={draft}
                    maxLength={60}
                    aria-label="Project name"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { settled.current = true; void rename(p.id); }
                      if (e.key === "Escape") { settled.current = true; setEditing(null); }
                    }}
                    onBlur={() => { if (!settled.current) void rename(p.id); }}
                  />
                </div>
              ) : (
                <>
                {p.access !== "viewer" && <LogoDrop row={p} name={title} onDone={(err) => { if (err) setError(err); else { setError(null); router.refresh(); } }} />}
                <Link href={`/build/${p.id}`} className={`flex h-full min-w-0 flex-1 items-center gap-4 ${p.access !== "viewer" ? "pl-2" : "pl-4"}`}>
                  {p.access === "viewer" && <ProjectLogo src={p.logo} name={title} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-white">{title}{p.ticker ? <span className="ml-2 text-zinc-500">${p.ticker}</span> : null}</div>
                    <div className="flex items-center gap-3 truncate text-[12px] text-zinc-500">
                      <span className="flex shrink-0 items-center gap-1.5 text-zinc-400"><ChainIcon chain={p.chain} size={12} /> {CHAINS[p.chain].name}</span>
                      {p.status === "building" && <span className="flex shrink-0 items-center gap-1 text-zinc-400"><Loader2 size={11} className="animate-spin" /> Building</span>}
                      <span className="truncate max-sm:hidden">{p.prompt}</span>
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-[12px] text-zinc-500">{p.edited}</span>
                </Link>
                </>
              )}
              {p.liveUrl && (
                <a href={p.liveUrl} target="_blank" rel="noreferrer" className="hidden max-w-[220px] items-center gap-1.5 truncate px-2 text-[12px] text-lime hover:underline md:flex" title="Open the live site">
                  <Globe size={13} className="shrink-0" /> <span className="truncate">{host(p.liveUrl)}</span>
                </a>
              )}
              {busy === p.id ? <span className="grid h-9 w-9 place-items-center"><Loader2 size={15} className="animate-spin text-zinc-400" /></span> : (() => {
                const edit = p.access !== "viewer";
                const items = [
                  ...(edit ? [
                    { value: "rename" as Pick, label: "Rename", icon: <Pencil size={14} /> },
                    { value: "duplicate" as Pick, label: "Duplicate", icon: <Copy size={14} />, disabled: p.status === "building" },
                  ] : []),
                  ...(p.mine ? teams.filter((t) => t.id !== current?.id).map((t) => ({ value: `move:${t.id}` as Pick, label: `Move to ${t.name}`, icon: <FolderInput size={14} /> })) : []),
                  ...(current && (p.mine || current.owner) ? [{ value: "move:" as Pick, label: p.mine ? "Move to Personal" : "Move out of team", icon: <FolderOutput size={14} /> }] : []),
                  ...(p.access === "owner" ? [{ value: "delete" as Pick, label: "Delete", icon: <Trash2 size={14} className="text-red-300" /> }] : []),
                ];
                if (!items.length) return <span className="w-9 shrink-0" />;
                return (
                  <Menu
                    label={`${title} actions`}
                    align="right"
                    width={220}
                    onPick={(v: Pick) => {
                      if (v === "rename") { settled.current = false; setDraft(title); setEditing(p.id); }
                      else if (v === "duplicate") void duplicate(p.id);
                      else if (v.startsWith("move:")) void move(p.id, v.slice(5) || null);
                      else setConfirm({ ...p, title });
                    }}
                    items={items}
                    trigger={() => <button type="button" className="btn btn-ghost btn-icon" aria-label={`Actions for ${title}`}><MoreHorizontal size={16} /></button>}
                  />
                );
              })()}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete project"
        icon={<Trash2 size={15} />}
        width={420}
        footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className="btn border border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25" disabled={busy === confirm?.id} onClick={() => confirm && void remove(confirm)}>
            {busy === confirm?.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
          </button>
        </>}
      >
        <p className="p-5 text-[13.5px] leading-relaxed text-zinc-300">
          Delete <span className="font-medium text-white">{confirm?.title}</span>? Its chat, pictures and history go with it
          {confirm?.liveUrl ? <>, and the live site at <span className="text-white">{host(confirm.liveUrl)}</span> goes offline</> : null}. This can&apos;t be undone.
        </p>
      </Dialog>
    </>
  );
}
