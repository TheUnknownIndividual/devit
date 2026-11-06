"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, FileCode2, History, ImagePlus, Link2, Loader2, RotateCcw } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { PublicProject } from "@/lib/public";
import { prepareImage } from "./attach";

// The builder's side tools: version history, the code view, project knowledge, the view-only share link, the
// project logo tile and dictation.

const when = (at: number) => {
  if (!at) return "Before history had times";
  const d = new Date(at), today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/** Every saved version, newest first. Clicking one shows it in the preview; Restore puts it back. */
export function HistoryPanel({ versions, viewing, canEdit, busy, onView, onRestore, onClose }: {
  versions: PublicProject["versions"]; viewing: number | null; canEdit: boolean; busy: boolean;
  onView: (i: number | null) => void; onRestore: (i: number) => void; onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-ink-950">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4">
        <History size={15} className="text-zinc-400" />
        <span className="text-[13.5px] font-semibold text-white">History</span>
        <span className="text-[12px] text-zinc-500">{versions.length} saved</span>
        <button type="button" className="btn btn-ghost ml-auto h-8 px-2.5 text-[12.5px]" onClick={() => { onView(null); onClose(); }}>Done</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <button type="button" onClick={() => onView(null)} className={`mb-1.5 w-full rounded-[12px] border px-3 py-2.5 text-left ${viewing === null ? "border-sel/40 bg-sel/[0.06]" : "border-white/[0.07] hover:border-white/15"}`}>
          <span className="block text-[13px] font-medium text-white">Current version</span>
          <span className="block text-[11.5px] text-zinc-500">What the builder shows now</span>
        </button>
        {!versions.length && <p className="px-1 pt-3 text-[12.5px] text-zinc-500">Each change saves the version before it here, up to the last 30.</p>}
        {versions.map((v) => (
          <div key={v.i} className={`mb-1.5 rounded-[12px] border ${viewing === v.i ? "border-sel/40 bg-sel/[0.06]" : "border-white/[0.07] hover:border-white/15"}`}>
            <button type="button" className="w-full px-3 pt-2.5 text-left" onClick={() => onView(v.i)}>
              <span className="block text-[11.5px] text-zinc-500">{when(v.at)}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-zinc-200">Before: {v.label}</span>
            </button>
            <div className="flex items-center gap-1.5 px-2 pb-2 pt-1.5">
              <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => onView(v.i)}>Preview</button>
              {canEdit && <button type="button" className="btn btn-outline h-7 px-2 text-[12px]" disabled={busy} onClick={() => onRestore(v.i)}><RotateCcw size={12} /> Restore</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type CodeFile = { path: string; size: number; text: string };

/** The same files Export ships, read-only, with a file list on the left. */
export function CodeView({ projectId, version }: { projectId: string; version: number }) {
  const [files, setFiles] = useState<CodeFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/projects/${projectId}/code`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) { setError(j.error ?? "Couldn't load the code."); return; }
      setFiles(j.files);
      setCur((c) => c ?? j.files[0]?.path ?? null);
    }).catch(() => live && setError("Couldn't load the code."));
    return () => { live = false; };
  }, [projectId, version]);
  if (error) return <div className="grid flex-1 place-items-center p-8 text-[13px] text-zinc-400">{error}</div>;
  if (!files) return <div className="grid flex-1 place-items-center"><Loader2 size={16} className="animate-spin text-zinc-500" /></div>;
  const file = files.find((f) => f.path === cur) ?? files[0];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr] bg-ink-950">
      <nav className="min-h-0 overflow-y-auto border-r border-white/[0.07] py-2" aria-label="Files">
        {files.map((f) => (
          <button key={f.path} type="button" title={f.path} onClick={() => setCur(f.path)} className={`flex w-full items-center gap-1.5 truncate px-3 py-1 text-left font-mono text-[11.5px] ${f.path === file?.path ? "bg-white/[0.07] text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            <FileCode2 size={12} className="shrink-0 text-zinc-500" /><span className="truncate">{f.path}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
          <span className="truncate font-mono text-[11.5px] text-zinc-300">{file?.path}</span>
          <span className="text-[11px] text-zinc-600">read-only · {file ? `${(file.size / 1024).toFixed(1)} KB` : ""}</span>
          <button type="button" className="btn btn-ghost ml-auto h-7 px-2 text-[12px]" onClick={() => { if (file) { void navigator.clipboard.writeText(file.text); setCopied(true); setTimeout(() => setCopied(false), 1200); } }}>
            {copied ? <Check size={12} className="text-lime" /> : <Copy size={12} />} Copy
          </button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[12px] leading-[1.6] text-zinc-200"><code>{file?.text.split("\n").map((l, i) => <div key={i} className="flex"><span className="w-10 shrink-0 select-none pr-3 text-right text-zinc-600">{i + 1}</span><span className="whitespace-pre">{l || " "}</span></div>)}</code></pre>
      </div>
    </div>
  );
}

/** Standing instructions the agent reads on every change. */
export function KnowledgeDialog({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const [text, setText] = useState(project.knowledge ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setText(project.knowledge ?? ""); setErr(null); } }, [open, project.knowledge]);
  async function save() {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/projects/${project.id}/knowledge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ knowledge: text }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok && j?.id) { onSaved(j); onClose(); } else setErr(j?.error ?? "Didn't save. Try again.");
  }
  return (
    <Dialog open={open} onClose={onClose} title="Project knowledge" icon={<BookOpen size={16} />} width={560}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Save</button></>}>
      <div className="space-y-2.5">
        <p className="text-[12.5px] text-zinc-400">The agent follows these on every change and in Plan and Ask: tone of voice, words to avoid, links to always use, facts about the project.</p>
        <textarea className="field min-h-[180px] w-full resize-y py-2.5 text-[13px] leading-relaxed" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Always lowercase.\nNever say \"moon\" or \"100x\".\nOur Telegram is t.me/frogs, our site is frogs.xyz.\nThe mascot is a green frog called Ribbit."} />
        <div className="flex items-center text-[11.5px] text-zinc-500"><span>{err ? <span className="text-amber-300">{err}</span> : "Kept with the project; team members see it too."}</span><span className="ml-auto">{text.length}/2000</span></div>
      </div>
    </Dialog>
  );
}

/** The view-only builder link: make it, copy it, or turn it off. */
export function ShareDialog({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const make = useCallback(async () => {
    setBusy(true);
    const r = await fetch(`/api/projects/${project.id}/share`, { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok && j?.shareUrl) { setUrl(`${window.location.origin}${j.shareUrl}`); onSaved(j); }
  }, [project.id, onSaved]);
  useEffect(() => { if (open && project.shared && !url) void make(); }, [open, project.shared, url, make]);
  async function off() {
    setBusy(true);
    const r = await fetch(`/api/projects/${project.id}/share`, { method: "DELETE" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok && j?.id) { setUrl(null); onSaved(j); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Share the builder" icon={<Link2 size={16} />} width={520}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-zinc-400">Anyone with this link sees the chat, history, code and preview, and can&apos;t change anything. Good for showing a teammate or a reviewer how the site was made.</p>
        {url ? (
          <>
            <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.08] bg-ink-900 p-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-200">{url}</code>
              <button type="button" className="btn btn-outline h-8 px-2.5 text-[12px]" onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
                {copied ? <Check size={13} className="text-lime" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button type="button" className="btn btn-ghost h-8 px-2.5 text-[12px] text-zinc-400" disabled={busy} onClick={() => void off()}>Turn the link off</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void make()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Make a view-only link</button>
        )}
      </div>
    </Dialog>
  );
}

/** The project's logo in the top bar: click to pick a picture, or drop one on it. */
export function ProjectLogo({ project, editable, onSaved }: { project: PublicProject; editable: boolean; onSaved: (p: PublicProject) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const src = project.spec?.logo ?? project.spec?.token?.logo ?? project.spec?.x?.profile.avatar ?? null;
  const letter = (project.spec?.ticker || project.title || "S").slice(0, 1).toUpperCase();

  async function use(file: File | undefined) {
    if (!file || !editable || !project.spec) return;
    setErr(null);
    const img = await prepareImage(file);
    if ("error" in img) { setErr(img.error); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", body: img.blob, headers: { "x-name": file.name.slice(0, 60), "x-w": String(img.w), "x-h": String(img.h), "content-type": img.blob.type } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.asset) { setErr(j.error ?? "That picture didn't upload."); return; }
      const s = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: j.asset.url }) });
      const p = await s.json().catch(() => null);
      if (s.ok && p?.id) onSaved(p); else setErr("Couldn't set the logo.");
    } finally { setBusy(false); }
  }

  const tile = (
    <span className={`relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] border ${over ? "border-sel bg-sel/10" : "border-white/10 bg-ink-850"}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="text-[14px] font-semibold text-zinc-200">{letter}</span>}
      {editable && <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">{busy ? <Loader2 size={14} className="animate-spin text-white" /> : <ImagePlus size={14} className="text-white" />}</span>}
      {busy && <span className="absolute inset-0 grid place-items-center bg-black/55"><Loader2 size={14} className="animate-spin text-white" /></span>}
    </span>
  );
  if (!editable || !project.spec) return <span className="ml-1">{tile}</span>;
  return (
    <span className="relative ml-1">
      <button
        type="button"
        className="group block rounded-[10px]"
        title={err ?? "Change the logo: click to pick a picture, or drop one here"}
        aria-label="Change the project logo"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); void use(e.dataTransfer.files[0]); }}
      >
        {tile}
      </button>
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void use(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <span role="alert" className="absolute left-0 top-11 z-40 w-[220px] rounded-[10px] border border-white/10 bg-ink-850 px-2.5 py-1.5 text-[11.5px] text-amber-300 shadow-lg">{err}</span>}
    </span>
  );
}

/** The browser's speech recogniser, when it has one. */
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };
function speechCtor(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Dictation: toggle() starts or stops; each phrase heard goes to onText. */
export function useDictation(onText: (said: string) => void) {
  const [can, setCan] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<Recognizer | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => { setCan(!!speechCtor()); return () => rec.current?.stop(); }, []);
  const toggle = useCallback(() => {
    if (rec.current && on) { rec.current.stop(); return; }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => { const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim(); if (said) cb.current(said); };
    r.onend = () => { setOn(false); rec.current = null; };
    rec.current = r;
    setOn(true);
    r.start();
  }, [on]);
  return { can, on, toggle };
}
