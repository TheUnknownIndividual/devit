"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, History, Link2, Loader2, RotateCcw } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { PublicProject } from "@/lib/public";

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
      <div className="min-w-0 space-y-2.5 p-5">
        <p className="text-[12.5px] text-zinc-400">The agent follows these on every change and in Plan and Ask: tone of voice, words to avoid, links to always use, facts about the project.</p>
        <textarea className="field block h-auto min-h-[180px] max-h-[50vh] w-full resize-y py-2.5 text-[13px] leading-relaxed" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Always lowercase.\nNever say \"moon\" or \"100x\".\nOur Telegram is t.me/frogs, our site is frogs.xyz.\nThe mascot is a green frog called Ribbit."} />
        <div className="flex items-center gap-3 text-[11.5px] text-zinc-500"><span className="min-w-0">{err ? <span className="text-amber-300">{err}</span> : "Kept with the project; team members see it too."}</span><span className="ml-auto shrink-0 tabular-nums">{text.length}/2000</span></div>
      </div>
    </Dialog>
  );
}

/** The view-only builder link, inside Publish: copy it (made on first copy), or turn it off. */
export function ShareSection({ project, onSaved }: { project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function copy() {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/projects/${project.id}/share`, { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok || !j?.shareUrl) { setErr(j?.error ?? "Couldn't make the link."); return; }
    onSaved(j);
    await navigator.clipboard?.writeText(`${window.location.origin}${j.shareUrl}`).catch(() => undefined);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }
  async function off() {
    setBusy(true);
    const r = await fetch(`/api/projects/${project.id}/share`, { method: "DELETE" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok && j?.id) onSaved(j);
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
      <Link2 size={16} className="shrink-0 text-zinc-400" />
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="text-[13px] font-medium text-white">Share the builder</div>
        <p className="text-[12px] text-zinc-500">{err ? <span className="text-amber-300">{err}</span> : "A view-only link to this chat, history, code and preview. Nobody can change anything with it."}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {project.shared && <button type="button" className="btn btn-ghost h-8 px-2.5 text-[12px] text-zinc-400" disabled={busy} onClick={() => void off()}>Turn off</button>}
        <button type="button" className="btn btn-outline h-8 px-2.5 text-[12px]" disabled={busy} onClick={() => void copy()}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : copied ? <Check size={13} className="text-lime" /> : <Copy size={13} />} {copied ? "Copied" : "Copy link to share"}
        </button>
      </div>
    </div>
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
