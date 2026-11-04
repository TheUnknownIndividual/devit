"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, ChevronDown, Crosshair, ExternalLink, Globe, Loader2, MessageSquare, Monitor, MousePointer2, Palette, Plug, Server,
  FileText, ImagePlus, Smartphone, Tablet, Trash2, Undo2, X,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { ChainIcon } from "@/components/brand";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { Menu } from "@/components/ui/Menu";
import { THEME_LABELS } from "@/lib/themes";
import { CHAINS, newId, type Chain, type PendingComment, type ThemeId } from "@/lib/spec";
import type { PublicProject } from "@/lib/public";
import type { FromBuilder, FromPreview } from "@/app/preview/[id]/PreviewClient";
import { BuildSteps } from "./BuildSteps";
import { IntegrationsDialog } from "./Integrations";
import { RpcDialog } from "./RpcDialog";
import { PublishDialog } from "./PublishDialog";
import { prepareImage, readDoc, type Doc } from "./attach";

type Device = "desktop" | "tablet" | "phone";
const WIDTH: Record<Device, string> = { desktop: "100%", tablet: "820px", phone: "390px" };

const VIA: Record<string, string> = { "near-ai": "NEAR AI Cloud", claude: "Claude", "offline writer": "Offline writer", "offline editor": "Offline editor" };

export function Workspace({ initial, heliusOnServer }: { initial: PublicProject; heliusOnServer: boolean }) {
  const [p, setP] = useState(initial);
  const [device, setDevice] = useState<Device>("desktop");
  const [selectOn, setSelectOn] = useState(true);
  // Every pick in the preview; shift-click adds or removes one, and a comment goes to all of them.
  const [picks, setPicks] = useState<Array<{ blockId: string; label: string; element: string | null }>>([]);
  const selected = picks[picks.length - 1] ?? null;
  // Changes that failed to apply, kept so they can be tried again; a comment normally applies the moment Enter is hit.
  const [comments, setComments] = useState<PendingComment[]>([]);
  const [applying, setApplying] = useState(0);
  // Pictures uploaded for the next message, and text files read in the browser.
  const [attached, setAttached] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "apply" | "chat" | "undo" | "patch">(null);
  const [dialog, setDialog] = useState<null | "integrations" | "rpc" | "publish">(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [frameReady, setFrameReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const building = p.status === "building";

  // Poll while the build runs; the build writes each step as it goes.
  useEffect(() => {
    if (!building) return;
    const h = setInterval(async () => {
      const r = await fetch(`/api/projects/${p.id}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) setP((await r.json()) as PublicProject);
    }, 600);
    return () => clearInterval(h);
  }, [building, p.id]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [p.messages.length, p.steps.length, comments.length]);

  const send = useCallback((m: FromBuilder) => frame.current?.contentWindow?.postMessage(m, window.location.origin), []);

  const markers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of comments) counts.set(c.blockId, (counts.get(c.blockId) ?? 0) + 1);
    return [...counts].map(([blockId, n]) => ({ blockId, n }));
  }, [comments]);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as FromPreview;
      if (m?.type === "ss:ready") setFrameReady(true);
      else if (m?.type === "ss:pick") {
        const pick = { blockId: m.blockId, label: m.label, element: m.element };
        const same = (x: typeof pick) => x.blockId === pick.blockId && x.element === pick.element;
        setPicks((cur) => (m.add ? (cur.some(same) ? cur.filter((x) => !same(x)) : [...cur, pick]) : [pick]));
        input.current?.focus();
      }
      else if (m?.type === "ss:picks") {
        // A drag-select in the preview: whole blocks, or the parts of one.
        setPicks((cur) => {
          const key = (x: { blockId: string; element: string | null }) => `${x.blockId}|${x.element ?? ""}`;
          const base = m.add ? cur : [];
          const have = new Set(base.map(key));
          return [...base, ...m.items.filter((x) => !have.has(key(x)))];
        });
        input.current?.focus();
      }
      else if (m?.type === "ss:clear") setPicks([]);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  // Keep the preview in step without reloading it.
  useEffect(() => { if (frameReady && p.spec) send({ type: "ss:spec", spec: p.spec }); }, [frameReady, p.version, p.spec, send]);
  useEffect(() => { if (frameReady) send({ type: "ss:select", on: selectOn }); }, [frameReady, selectOn, send]);
  useEffect(() => { if (frameReady) send({ type: "ss:markers", items: markers }); }, [frameReady, markers, send]);
  useEffect(() => { if (frameReady) send({ type: "ss:selected", items: picks.map(({ blockId, element }) => ({ blockId, element })) }); }, [frameReady, picks, send]);

  // Esc drops the selection wherever focus is (the preview frame handles it when focus is in there).
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialog && picks.length) { e.preventDefault(); setPicks([]); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, picks.length]);

  async function attach(files: FileList | File[]) {
    setAttachError(null);
    for (const f of [...files]) {
      if (/^text\/|\.(md|txt)$/i.test(f.type || f.name)) {
        const d = await readDoc(f);
        if ("error" in d) setAttachError(d.error); else setDocs((cur) => [...cur.filter((x) => x.name !== d.name), d].slice(-3));
        continue;
      }
      if (attached.length + uploading >= 6) { setAttachError("Six pictures per message at most."); break; }
      const img = await prepareImage(f);
      if ("error" in img) { setAttachError(img.error); continue; }
      setUploading((n) => n + 1);
      try {
        const r = await fetch(`/api/projects/${p.id}/assets`, { method: "POST", body: img.blob, headers: { "x-name": f.name.slice(0, 60), "x-w": String(img.w), "x-h": String(img.h), "content-type": img.blob.type } });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.asset) setAttached((cur) => [...cur, { id: j.asset.id, url: j.asset.url, name: j.asset.name }]);
        else setAttachError(j.error ?? "That picture didn't upload.");
      } finally { setUploading((n) => n - 1); }
    }
  }

  async function call(path: string, body: unknown, kind: NonNullable<typeof busy>, method = "POST") {
    setBusy(kind);
    try {
      const r = await fetch(`/api/projects/${p.id}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok && j.id) setP(j as PublicProject);
      return r.ok;
    } finally {
      setBusy(null);
    }
  }

  // Enter sends: with blocks picked it applies the change to them right away (with any changes that failed before).
  function submit() {
    const t = text.trim();
    if (!t || busy || building || uploading) return;
    const assets = attached.map((a) => a.id);
    setText(""); setAttached([]); setDocs([]); setAttachError(null);
    if (picks.length) {
      const fresh = picks.map((s) => ({ id: newId(), blockId: s.blockId, blockLabel: s.element ? `${s.label} · ${s.element}` : s.label, element: s.element ?? undefined, text: t, ...(assets.length ? { assets } : {}) }));
      void apply([...comments, ...fresh]);
      return;
    }
    void call("/chat", { text: t, ...(assets.length ? { assets } : {}), ...(docs.length ? { docs } : {}) }, "chat");
  }

  async function apply(all = comments) {
    if (!all.length) return;
    setApplying(all.length);
    const ok = await call("/apply", { comments: all }, "apply");
    if (ok) { setComments([]); setPicks([]); } else setComments(all);
  }

  const ready = !!p.spec;
  const chain = p.network.chain;
  const title = p.spec?.name ?? "New site";

  return (
    <div className="flex h-screen flex-col bg-ink-950">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
        <Link href="/" className="btn btn-ghost btn-icon" aria-label="Home"><LogoMark size={20} /></Link>
        <Link href="/projects" className="btn btn-ghost hidden max-w-[220px] sm:inline-flex" title="My sites">
          <span className="truncate font-semibold text-white">{title}</span>
          {p.spec?.ticker && <span className="text-zinc-500">${p.spec.ticker}</span>}
        </Link>
        {building && <span className="hidden items-center gap-1.5 text-[12px] text-zinc-400 sm:flex"><Loader2 size={13} className="animate-spin text-sel" /> Building</span>}

        <div className="mx-auto hidden items-center gap-1 rounded-[11px] border border-white/[0.07] bg-ink-900 p-0.5 md:flex" role="radiogroup" aria-label="Preview size">
          {([["desktop", Monitor], ["tablet", Tablet], ["phone", Smartphone]] as const).map(([d, Icon]) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={d} onClick={() => setDevice(d)} className={`btn btn-icon h-8 w-8 ${device === d ? "bg-white/[0.09] text-white" : "btn-ghost"}`}><Icon size={15} /></button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <div className="flex items-center gap-1 rounded-[11px] border border-white/[0.07] bg-ink-900 p-0.5 md:hidden">
            <button type="button" onClick={() => setMobileTab("chat")} className={`btn h-8 ${mobileTab === "chat" ? "bg-white/[0.09] text-white" : "btn-ghost"}`}><MessageSquare size={14} /></button>
            <button type="button" onClick={() => setMobileTab("preview")} className={`btn h-8 ${mobileTab === "preview" ? "bg-white/[0.09] text-white" : "btn-ghost"}`}><Monitor size={14} /></button>
          </div>
          <Menu
            label="Network"
            align="right"
            value={chain}
            onPick={(c: Chain) => void call("", { chain: c }, "patch", "PATCH")}
            items={(Object.keys(CHAINS) as Chain[]).map((c) => ({ value: c, label: CHAINS[c].name, icon: <ChainIcon chain={c} size={15} /> }))}
            trigger={(o) => (
              <button type="button" className="btn btn-outline" aria-label={`Network: ${CHAINS[chain].name}`}>
                <ChainIcon chain={chain} size={15} /><span className="hidden lg:inline">{CHAINS[chain].name}</span><ChevronDown size={14} className={`text-zinc-500 ${o ? "rotate-180" : ""}`} />
              </button>
            )}
          />
          <button type="button" className="btn btn-outline btn-icon hidden sm:inline-flex" onClick={() => setDialog("rpc")} aria-label="RPC endpoint" title="RPC endpoint">
            <span className="relative"><Server size={15} />{p.network.rpcUrlSet && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-lime" />}</span>
          </button>
          {ready && (
            <Menu
              label="Style"
              align="right"
              value={p.spec!.theme.id}
              onPick={(t: ThemeId) => void call("", { themeId: t }, "patch", "PATCH")}
              items={(Object.keys(THEME_LABELS) as ThemeId[]).map((t) => ({ value: t, label: THEME_LABELS[t], icon: <ThemeSwatch id={t} size={15} /> }))}
              trigger={() => <button type="button" className="btn btn-outline btn-icon hidden sm:inline-flex" aria-label="Style" title="Style"><Palette size={15} /></button>}
            />
          )}
          <button type="button" className="btn btn-outline" onClick={() => setDialog("integrations")}><Plug size={15} /><span className="hidden lg:inline">Integrations</span></button>
          <span className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" />
          <button type="button" className="btn btn-ghost btn-icon hidden sm:inline-flex" disabled={!p.history.length || !!busy} onClick={() => void call("/undo", {}, "undo")} aria-label="Undo" title="Undo"><Undo2 size={16} /></button>
          <a className={`btn btn-ghost btn-icon hidden sm:inline-flex ${ready ? "" : "pointer-events-none opacity-50"}`} href={`/live/${p.id}`} target="_blank" rel="noreferrer" aria-label="Open live" title="Open live"><ExternalLink size={16} /></a>
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => setDialog("publish")}>
            <Globe size={15} /> <span className="hidden sm:inline">{p.published ? (p.publishedIsCurrent ? "Published" : "Update") : "Publish"}</span>
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[400px_1fr]">
        {/* Chat */}
        <aside
          className={`relative min-h-0 flex-col border-r border-white/[0.07] bg-ink-950 ${mobileTab === "chat" ? "flex" : "hidden"} md:flex`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
          onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragOver(false); if (ready && !building) void attach(e.dataTransfer.files); }}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-[14px] border border-dashed border-sel/60 bg-ink-950/90 text-center">
              <div><ImagePlus size={20} className="mx-auto text-sel" /><p className="mt-2 text-[13px] text-white">Drop pictures or a .txt / .md file</p><p className="mt-1 text-[11.5px] text-zinc-500">PNG, JPEG, WebP or GIF. Big pictures are shrunk to 400 KB.</p></div>
            </div>
          )}
          <div ref={list} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {p.messages.map((m, i) => (
              <div key={m.id} className="animate-rise">
                {m.role === "user" ? (
                  <div className="ml-8 whitespace-pre-line break-words [overflow-wrap:anywhere] rounded-[14px] rounded-tr-md border border-white/[0.07] bg-ink-850 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-zinc-100">
                    {m.text}
                    {!!m.assets?.length && <div className="mt-2 flex flex-wrap gap-1.5">{m.assets.map((u) => <img key={u} src={u} alt="" className="h-12 w-12 rounded-md border border-white/10 object-cover" />)}</div>}
                  </div>
                ) : (
                  <div className="flex gap-2.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-ink-900"><LogoMark size={13} /></span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] leading-relaxed text-zinc-200">{m.text}</p>
                      {m.via && <span className="mt-1.5 inline-flex h-5 items-center rounded-md bg-white/[0.05] px-1.5 text-[10.5px] text-zinc-500">{VIA[m.via] ?? m.via}</span>}
                    </div>
                  </div>
                )}
                {i === 0 && (p.steps.length > 0 || building) && <div className="mt-4"><BuildSteps steps={p.steps} building={building} /></div>}
              </div>
            ))}
            {busy === "apply" || busy === "chat" ? (
              <div className="flex items-center gap-2.5 text-[13px] text-zinc-400"><Loader2 size={14} className="animate-spin text-sel" /> {busy === "apply" ? `Applying ${applying} change${applying === 1 ? "" : "s"}…` : "Working on it…"}</div>
            ) : null}
          </div>

          {comments.length > 0 && busy !== "apply" && (
            <div className="mx-3 mb-2 animate-rise rounded-[14px] border border-sel/30 bg-sel/[0.05]">
              <div className="flex h-11 items-center gap-2 px-3">
                <Crosshair size={14} className="text-sel" />
                <span className="text-[13px] font-medium text-white">{comments.length} change{comments.length === 1 ? "" : "s"} didn&apos;t apply</span>
                <button type="button" className="btn btn-ghost ml-auto h-8 px-2 text-[12px]" onClick={() => setComments([])}>Clear</button>
                <button type="button" className="btn btn-primary h-8" disabled={!!busy} onClick={() => void apply()}>
                  <ArrowUp size={14} /> Try again
                </button>
              </div>
              <ul className="max-h-44 space-y-1 overflow-y-auto px-2 pb-2">
                {comments.map((c) => (
                  <li key={c.id} className="group flex items-start gap-2 rounded-[10px] bg-ink-900/80 px-2.5 py-2">
                    <button type="button" className="mt-px shrink-0 rounded-md bg-sel/15 px-1.5 py-0.5 text-[11px] font-medium text-sel" onClick={() => send({ type: "ss:focus", blockId: c.blockId })}>{c.blockLabel}</button>
                    <span className="min-w-0 flex-1 text-[12.5px] text-zinc-200">{c.text}</span>
                    <button type="button" aria-label="Remove change" className="btn btn-ghost btn-icon h-6 w-6 opacity-60 group-hover:opacity-100" onClick={() => setComments((all) => all.filter((x) => x.id !== c.id))}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 pt-0">
            <div className="rounded-[16px] border border-white/10 bg-ink-900 focus-within:border-white/20">
              {(attached.length > 0 || docs.length > 0 || uploading > 0 || attachError) && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
                  {attached.map((a) => (
                    <span key={a.id} className="relative">
                      <img src={a.url} alt={a.name} className="h-11 w-11 rounded-lg border border-white/10 object-cover" />
                      <button type="button" aria-label={`Remove ${a.name}`} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-ink-850 text-zinc-300 hover:text-white" onClick={() => setAttached((cur) => cur.filter((x) => x.id !== a.id))}><X size={11} /></button>
                    </span>
                  ))}
                  {uploading > 0 && <span className="grid h-11 w-11 place-items-center rounded-lg border border-white/10"><Loader2 size={14} className="animate-spin text-zinc-400" /></span>}
                  {docs.map((d) => (
                    <span key={d.name} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[12px] text-zinc-300">
                      <FileText size={13} /> {d.name}
                      <button type="button" aria-label={`Remove ${d.name}`} className="ml-0.5 text-zinc-500 hover:text-white" onClick={() => setDocs((cur) => cur.filter((x) => x.name !== d.name))}><X size={13} /></button>
                    </span>
                  ))}
                  {attachError && <span className="text-[11.5px] text-red-300">{attachError}</span>}
                </div>
              )}
              {picks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
                  {picks.map((s) => (
                    <span key={`${s.blockId}|${s.element ?? ""}`} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-sel/40 bg-sel/10 px-2 text-[12px] text-sel">
                      <Crosshair size={13} /> {s.label}{s.element ? ` · ${s.element}` : ""}
                      <button type="button" aria-label={`Remove ${s.label} from the selection`} className="ml-0.5 text-sel/70 hover:text-sel" onClick={() => setPicks((cur) => cur.filter((x) => x !== s))}><X size={13} /></button>
                    </span>
                  ))}
                  {selected?.element && <span className="text-[11px] text-zinc-500"><span className="kbd">↑</span> whole block</span>}
                  {picks.length === 1 && !selected?.element && <span className="text-[11px] text-zinc-500"><span className="kbd">Shift</span>-click to add more</span>}
                </div>
              )}
              <textarea
                ref={input}
                rows={2}
                value={text}
                disabled={building}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length && ready) { e.preventDefault(); void attach(f); } }}
                placeholder={building ? "Building…" : picks.length > 1 ? `What should change in these ${picks.length}?` : selected ? `What should change in ${selected.label}?` : "Ask for a change, or paste a contract address…"}
                className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[13.5px] leading-relaxed text-white outline-none placeholder:text-zinc-500"
              />
              <div className="flex items-center gap-1.5 p-2">
                <button
                  type="button"
                  onClick={() => setSelectOn((s) => !s)}
                  aria-pressed={selectOn}
                  className={`btn h-8 ${selectOn ? "border border-sel/40 bg-sel/10 text-sel" : "btn-ghost"}`}
                  title="Click blocks in the preview to comment on them"
                >
                  <MousePointer2 size={14} /> Select
                </button>
                <button type="button" className="btn btn-ghost btn-icon h-8 w-8" disabled={!ready || building} onClick={() => fileInput.current?.click()} aria-label="Add a picture or text file" title="Add a picture or text file"><ImagePlus size={15} /></button>
                <input ref={fileInput} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,text/plain,text/markdown" onChange={(e) => { if (e.target.files) void attach(e.target.files); e.target.value = ""; }} />
                <span className="ml-1 hidden text-[11.5px] text-zinc-500 lg:inline">{selected ? "Enter applies · Esc clears" : selectOn ? "Click or drag over blocks" : ""}</span>
                <button type="button" className="btn btn-primary btn-icon ml-auto h-8 w-8" disabled={!text.trim() || !!busy || building || uploading > 0} onClick={submit} aria-label={selected ? "Apply" : "Send"}>
                  {busy === "chat" ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Preview */}
        <section className={`min-h-0 flex-col bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:16px_16px] ${mobileTab === "preview" ? "flex" : "hidden"} md:flex`}>
          <div className="flex min-h-0 flex-1 justify-center overflow-hidden p-3">
            <div className="flex h-full flex-col overflow-hidden rounded-[14px] border border-white/[0.08] bg-ink-900 shadow-[0_12px_40px_rgba(0,0,0,0.4)] transition-[width] duration-300" style={{ width: WIDTH[device], maxWidth: "100%" }}>
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
                <span className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" /><span className="h-2 w-2 rounded-full bg-white/15" /></span>
                <span className="mx-auto flex h-6 min-w-0 max-w-[360px] flex-1 items-center justify-center gap-1.5 truncate rounded-md bg-white/[0.04] px-2 font-mono text-[11px] text-zinc-500">
                  <Globe size={11} />{p.published ? `${p.published.slug}${p.sitesDomain ? `.${p.sitesDomain}` : ".sitesmith"}` : "preview"}
                </span>
                <span className="text-[11px] text-zinc-600">{selectOn ? "Select on" : "Browse"}</span>
              </div>
              {ready ? (
                <iframe ref={frame} key={p.id} src={`/preview/${p.id}`} title="Site preview" className="min-h-0 w-full flex-1 bg-white" />
              ) : (
                <Skeleton failed={p.status === "error"} />
              )}
            </div>
          </div>
        </section>
      </div>

      <IntegrationsDialog open={dialog === "integrations"} onClose={() => setDialog(null)} project={p} onSaved={setP} heliusOnServer={heliusOnServer} />
      <RpcDialog key={`rpc-${dialog === "rpc"}`} open={dialog === "rpc"} onClose={() => setDialog(null)} project={p} onSaved={setP} />
      <PublishDialog open={dialog === "publish"} onClose={() => setDialog(null)} project={p} onSaved={setP} />
    </div>
  );
}

function Skeleton({ failed }: { failed: boolean }) {
  if (failed) return <div className="grid flex-1 place-items-center p-8 text-center text-[13px] text-zinc-400">This build didn&apos;t finish. Check the steps on the left, then start again from the home page.</div>;
  return (
    <div className="flex-1 space-y-4 overflow-hidden bg-ink-850 p-6">
      <div className="flex items-center justify-between"><div className="h-7 w-32 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.09),rgba(255,255,255,0.04))] bg-[length:200%_100%]" /><div className="h-8 w-24 rounded bg-white/[0.05]" /></div>
      {[["h-14 w-3/4", 0], ["h-5 w-1/2", 80], ["h-11 w-40", 160]].map(([c, d]) => (
        <div key={String(c)} style={{ animationDelay: `${d}ms` }} className={`${c} animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.09),rgba(255,255,255,0.04))] bg-[length:200%_100%]`} />
      ))}
      <div className="grid grid-cols-4 gap-3 pt-6">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded bg-white/[0.04]" />)}</div>
    </div>
  );
}
