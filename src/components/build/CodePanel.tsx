"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Braces, Check, ChevronDown, ChevronRight, Copy, Download, FileCode2, FileJson, FileText, Folder, FolderOpen, Image as ImageIcon, Loader2, MessageCircleQuestion, PanelLeft, Search, X,
} from "lucide-react";

// The builder's code page: the files Export ships, laid out like an editor. A folder tree (or search across every
// file) on the left, open files as tabs on the right with line numbers and light syntax colouring. Read-only: the
// site is a spec, so changes go through the chat; "Ask about this" puts the file or the selected lines there.

type CodeFile = { path: string; size: number; text: string };
type Node = { name: string; path: string; dir: boolean; kids: Node[] };

function tree(files: CodeFile[]): Node[] {
  const root: Node = { name: "", path: "", dir: true, kids: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let at = root;
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join("/");
      const dir = i < parts.length - 1;
      let n = at.kids.find((k) => k.name === name && k.dir === dir);
      if (!n) { n = { name, path, dir, kids: [] }; at.kids.push(n); }
      at = n;
    });
  }
  const sort = (n: Node) => { n.kids.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)); n.kids.forEach(sort); };
  sort(root);
  return root.kids;
}

const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
function FileMark({ path }: { path: string }) {
  const e = ext(path);
  if (e === "json") return <FileJson size={13} className="shrink-0 text-amber-300/80" />;
  if (e === "tsx" || e === "jsx") return <Braces size={13} className="shrink-0 text-sky-300/80" />;
  if (e === "ts" || e === "js" || e === "mjs") return <FileCode2 size={13} className="shrink-0 text-sky-300/70" />;
  if (e === "css") return <FileCode2 size={13} className="shrink-0 text-fuchsia-300/70" />;
  if (e === "svg" || e === "png") return <ImageIcon size={13} className="shrink-0 text-emerald-300/70" />;
  return <FileText size={13} className="shrink-0 text-zinc-500" />;
}

// ---------- syntax colouring: a small tokenizer, enough to read TS/JS/JSON/CSS comfortably ----------

const KW = new Set("import export from default function return const let var if else for while do switch case break continue new class extends interface type enum as async await try catch finally throw typeof instanceof in of void null undefined true false this super yield satisfies readonly keyof declare public private protected static implements".split(" "));
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*(?:e[+-]?\d+)?\b|#[0-9a-fA-F]{3,8}\b)|([A-Za-z_$][\w$]*)|(<\/?[A-Za-z][\w.]*)/g;

function colour(line: string, kind: string): ReactNode[] {
  if (kind === "md" || kind === "txt") return [line];
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(line.slice(last, at));
    const [t, comment, str, num, word, tag] = m;
    const cls = comment ? "text-zinc-500 italic"
      : str ? (kind === "json" && line.slice(at + t.length).trimStart().startsWith(":") ? "text-sky-300" : "text-emerald-300")
      : num ? "text-amber-300"
      : tag ? "text-rose-300"
      : word && KW.has(word) ? "text-violet-300"
      : word && /^[A-Z]/.test(word) ? "text-sky-200"
      : word && line.slice(at + t.length).startsWith("(") ? "text-yellow-200"
      : null;
    out.push(cls ? <span key={k++} className={cls}>{t}</span> : t);
    last = at + t.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

// ---------- the panel ----------

export function CodePanel({ projectId, version, onAsk }: { projectId: string; version: number; onAsk?: (text: string) => void }) {
  const [files, setFiles] = useState<CodeFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [side, setSide] = useState<"files" | "search">("files");
  const [showSide, setShowSide] = useState(true);
  const [q, setQ] = useState("");
  const [jump, setJump] = useState<{ path: string; line: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/projects/${projectId}/code`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) { setError(j.error ?? "Couldn't load the code."); return; }
      const fs = j.files as CodeFile[];
      setFiles(fs);
      const first = fs.find((f) => f.path.endsWith("site.json"))?.path ?? fs[0]?.path ?? null;
      setCur((c) => (c && fs.some((f) => f.path === c) ? c : first));
      setTabs((t) => { const keep = t.filter((p) => fs.some((f) => f.path === p)); return keep.length ? keep : first ? [first] : []; });
      // Open the folders on the way to the first file, and every top-level one.
      setOpen((o) => {
        if (o.size) return o;
        const n = new Set<string>();
        for (const f of fs) { const parts = f.path.split("/"); if (parts.length > 1) n.add(parts[0]); }
        if (first) first.split("/").slice(0, -1).forEach((_, i, a) => n.add(a.slice(0, i + 1).join("/")));
        return n;
      });
    }).catch(() => live && setError("Couldn't load the code."));
    return () => { live = false; };
  }, [projectId, version]);

  // On a phone the tree starts closed so the code gets the width.
  useEffect(() => { if (window.innerWidth < 640) setShowSide(false); }, []);

  const nodes = useMemo(() => (files ? tree(files) : []), [files]);
  const file = files?.find((f) => f.path === cur) ?? null;
  const lines = useMemo(() => file?.text.split("\n") ?? [], [file]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!files || s.length < 2) return [];
    const out: Array<{ path: string; items: Array<{ line: number; text: string }> }> = [];
    let total = 0;
    for (const f of files) {
      const items: Array<{ line: number; text: string }> = [];
      f.text.split("\n").forEach((l, i) => { if (total < 300 && l.toLowerCase().includes(s)) { items.push({ line: i + 1, text: l.trim().slice(0, 160) }); total++; } });
      if (f.path.toLowerCase().includes(s) || items.length) out.push({ path: f.path, items });
    }
    return out;
  }, [files, q]);

  function show(path: string, line?: number) {
    setTabs((t) => (t.includes(path) ? t : [...t, path].slice(-8)));
    setCur(path);
    setJump(line ? { path, line } : null);
    if (window.innerWidth < 640) setShowSide(false);
  }
  function close(path: string) {
    setTabs((t) => {
      const next = t.filter((p) => p !== path);
      if (cur === path) setCur(next[next.length - 1] ?? null);
      return next;
    });
  }

  // Scroll to a search hit once its file is showing.
  useEffect(() => {
    if (!jump || jump.path !== cur) return;
    const el = codeRef.current?.querySelector(`[data-line="${jump.line}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [jump, cur, lines]);

  /** The selected lines in the code, if the selection is inside it. */
  function picked(): { from: number; to: number; text: string } | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !codeRef.current) return null;
    const lineOf = (n: globalThis.Node | null) => { const el = (n instanceof Element ? n : n?.parentElement)?.closest("[data-line]"); return el && codeRef.current!.contains(el) ? Number(el.getAttribute("data-line")) : null; };
    const a = lineOf(sel.anchorNode), b = lineOf(sel.focusNode);
    if (a == null || b == null) return null;
    const from = Math.min(a, b), to = Math.max(a, b);
    return { from, to, text: lines.slice(from - 1, to).join("\n") };
  }

  function ask() {
    if (!file || !onAsk) return;
    const s = picked();
    onAsk(s ? `About ${file.path} lines ${s.from}–${s.to}:\n${s.text.slice(0, 600)}\n\n` : `About ${file.path}: `);
  }

  function download() {
    if (!file) return;
    const url = URL.createObjectURL(new Blob([file.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = file.path.split("/").pop() ?? "file.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (error) return <div className="grid flex-1 place-items-center p-8 text-[13px] text-zinc-400">{error}</div>;
  if (!files) return <div className="grid flex-1 place-items-center"><Loader2 size={16} className="animate-spin text-zinc-500" /></div>;

  const kind = file ? (ext(file.path) === "json" ? "json" : ext(file.path) === "md" ? "md" : "code") : "code";
  const gutter = String(lines.length).length;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 bg-ink-950">
      {showSide && (
        <aside className="absolute inset-y-0 left-0 z-10 flex w-[min(260px,85%)] min-w-0 flex-col border-r border-white/[0.07] bg-ink-950 sm:static sm:w-[240px] sm:shrink-0">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/[0.07] px-1.5" role="tablist" aria-label="Files or search">
            <button type="button" role="tab" aria-selected={side === "files"} onClick={() => setSide("files")} className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] ${side === "files" ? "bg-white/[0.07] text-white" : "text-zinc-500 hover:text-zinc-200"}`}><Folder size={13} /> Files</button>
            <button type="button" role="tab" aria-selected={side === "search"} onClick={() => setSide("search")} className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] ${side === "search" ? "bg-white/[0.07] text-white" : "text-zinc-500 hover:text-zinc-200"}`}><Search size={13} /> Search</button>
            <span className="ml-auto pr-1 text-[11px] text-zinc-600">{files.length} files</span>
          </div>
          {side === "files" ? (
            <nav className="min-h-0 flex-1 overflow-y-auto py-1.5" aria-label="Files">
              <Tree nodes={nodes} depth={0} open={open} cur={cur} onToggle={(p) => setOpen((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; })} onPick={(p) => show(p)} />
            </nav>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-2">
                <input autoFocus className="field h-8 text-[12.5px]" placeholder="Search every file…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the code" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                {q.trim().length >= 2 && !hits.length && <p className="px-3 text-[12px] text-zinc-500">Nothing matches.</p>}
                {hits.map((h) => (
                  <div key={h.path} className="mb-1.5">
                    <button type="button" onClick={() => show(h.path)} className="flex w-full min-w-0 items-center gap-1.5 px-3 py-1 text-left text-[12px] text-zinc-200 hover:bg-white/[0.04]"><FileMark path={h.path} /><span className="truncate">{h.path}</span><span className="ml-auto shrink-0 text-[11px] text-zinc-600">{h.items.length || ""}</span></button>
                    {h.items.slice(0, 20).map((it) => (
                      <button key={it.line} type="button" onClick={() => show(h.path, it.line)} className="flex w-full min-w-0 gap-2 py-0.5 pl-7 pr-3 text-left font-mono text-[11.5px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">
                        <span className="w-7 shrink-0 text-right text-zinc-600">{it.line}</span><span className="truncate"><Mark text={it.text} q={q.trim()} /></span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-stretch border-b border-white/[0.07]">
          <button type="button" className="grid w-10 shrink-0 place-items-center border-r border-white/[0.07] text-zinc-500 hover:text-white" onClick={() => setShowSide((s) => !s)} aria-label={showSide ? "Hide the file tree" : "Show the file tree"} title={showSide ? "Hide files" : "Show files"}><PanelLeft size={15} /></button>
          <div className="flex min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label="Open files">
            {tabs.map((t) => (
              <div key={t} role="tab" aria-selected={t === cur} className={`group flex h-full max-w-[200px] shrink-0 items-center gap-1.5 border-r border-white/[0.07] pl-3 pr-1.5 text-[12px] ${t === cur ? "bg-ink-900 text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
                <button type="button" className="flex min-w-0 items-center gap-1.5" onClick={() => setCur(t)} title={t}><FileMark path={t} /><span className="truncate">{t.split("/").pop()}</span></button>
                <button type="button" aria-label={`Close ${t}`} className={`grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-white/10 ${t === cur ? "opacity-70" : "opacity-0 group-hover:opacity-70"}`} onClick={() => close(t)}><X size={11} /></button>
              </div>
            ))}
          </div>
        </div>
        {file ? (
          <>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
              <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11.5px] text-zinc-400">
                {file.path.split("/").map((seg, i, a) => <Fragment key={i}>{i > 0 && <ChevronRight size={11} className="shrink-0 text-zinc-600" />}<span className={i === a.length - 1 ? "text-zinc-200" : ""}>{seg}</span></Fragment>)}
              </span>
              <span className="hidden shrink-0 text-[11px] text-zinc-600 md:inline">{lines.length} lines · {(file.size / 1024).toFixed(1)} KB · read-only</span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {onAsk && <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={ask} title="Ask about this file, or the lines you selected"><MessageCircleQuestion size={13} /> <span className="hidden lg:inline">Ask about this</span></button>}
                <button type="button" className="btn btn-ghost btn-icon h-7 w-7" onClick={() => { void navigator.clipboard.writeText(file.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} aria-label="Copy the file" title="Copy">{copied ? <Check size={13} className="text-lime" /> : <Copy size={13} />}</button>
                <button type="button" className="btn btn-ghost btn-icon h-7 w-7" onClick={download} aria-label="Download the file" title="Download this file"><Download size={13} /></button>
              </div>
            </div>
            <div ref={codeRef} className="min-h-0 flex-1 overflow-auto py-2 font-mono text-[12px] leading-[1.65] text-zinc-200">
              {lines.map((l, i) => (
                <div key={i} data-line={i + 1} className={`flex min-w-max pr-6 ${jump && jump.path === cur && jump.line === i + 1 ? "bg-sel/15" : "hover:bg-white/[0.025]"}`}>
                  <span className="sticky left-0 shrink-0 select-none bg-ink-950 pl-3 pr-4 text-right text-zinc-600" style={{ width: `${gutter + 3}ch` }}>{i + 1}</span>
                  <span className="whitespace-pre">{l ? colour(l, kind) : " "}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-[13px] text-zinc-500">Pick a file on the left.</div>
        )}
      </div>
    </div>
  );
}

function Tree({ nodes, depth, open, cur, onToggle, onPick }: { nodes: Node[]; depth: number; open: Set<string>; cur: string | null; onToggle: (p: string) => void; onPick: (p: string) => void }) {
  return (
    <ul role={depth ? "group" : "tree"}>
      {nodes.map((n) => (
        <li key={n.path} role="treeitem" aria-expanded={n.dir ? open.has(n.path) : undefined} aria-selected={!n.dir && n.path === cur}>
          <button
            type="button"
            title={n.path}
            onClick={() => (n.dir ? onToggle(n.path) : onPick(n.path))}
            style={{ paddingLeft: 8 + depth * 14 }}
            className={`flex h-7 w-full min-w-0 items-center gap-1.5 pr-2 text-left text-[12.5px] ${!n.dir && n.path === cur ? "bg-sel/10 text-white" : "text-zinc-300 hover:bg-white/[0.04]"}`}
          >
            {n.dir ? (
              <>{open.has(n.path) ? <ChevronDown size={12} className="shrink-0 text-zinc-500" /> : <ChevronRight size={12} className="shrink-0 text-zinc-500" />}{open.has(n.path) ? <FolderOpen size={13} className="shrink-0 text-zinc-400" /> : <Folder size={13} className="shrink-0 text-zinc-400" />}</>
            ) : (
              <><span className="w-3 shrink-0" /><FileMark path={n.path} /></>
            )}
            <span className="truncate">{n.name}</span>
          </button>
          {n.dir && open.has(n.path) && <Tree nodes={n.kids} depth={depth + 1} open={open} cur={cur} onToggle={onToggle} onPick={onPick} />}
        </li>
      ))}
    </ul>
  );
}

function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-sel/30 text-white">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
