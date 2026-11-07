"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Loader2 } from "lucide-react";
import { TEMPLATES, TEMPLATE_KINDS, templateHref, type Template, type TemplateKind } from "@/lib/templates";
import { THEMES, THEME_LABELS } from "@/lib/themes";
import { CHAINS, type ThemeId } from "@/lib/spec";
import { ThemeSwatch } from "@/components/ThemeSwatch";

const DESK_W = 1280;
const FRAME_H = 800;

/** A wireframe of the sample site in the style's own colours, with a light sweep, shown until the real one loads. */
function Loading({ t, slow }: { t: Template; slow: boolean }) {
  const th = THEMES[t.style];
  const ink = th.dark ? "rgba(255,255,255," : "rgba(0,0,0,";
  const bar = (a: number) => `${ink}${a})`;
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 flex flex-col p-[6%]">
        <div className="flex items-center gap-[3%]">
          <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: th.accent }} />
          <span className="h-[6px] w-[18%] rounded-full" style={{ background: bar(0.16) }} />
          <span className="ml-auto h-[6px] w-[10%] rounded-full" style={{ background: bar(0.1) }} />
          <span className="h-[6px] w-[10%] rounded-full" style={{ background: bar(0.1) }} />
          <span className="h-[12px] w-[14%] rounded-[4px]" style={{ background: th.accent, opacity: 0.85 }} />
        </div>
        <div className="mt-[9%] h-[11px] w-[62%] rounded-full" style={{ background: bar(0.2) }} />
        <div className="mt-[3%] h-[11px] w-[44%] rounded-full" style={{ background: bar(0.2) }} />
        <div className="mt-[4%] h-[6px] w-[52%] rounded-full" style={{ background: bar(0.1) }} />
        <div className="mt-[5%] flex gap-[3%]">
          <span className="h-[16px] w-[20%] rounded-[5px]" style={{ background: th.accent }} />
          <span className="h-[16px] w-[16%] rounded-[5px] border" style={{ borderColor: bar(0.2) }} />
        </div>
        <div className="mt-auto grid grid-cols-3 gap-[3%]">
          {[0, 1, 2].map((i) => <span key={i} className="h-[34px] rounded-[6px] border" style={{ background: bar(0.04), borderColor: bar(0.08) }} />)}
        </div>
      </div>
      <div className="sheen absolute inset-0" style={{ background: `linear-gradient(100deg, transparent 20%, ${bar(th.dark ? 0.07 : 0.06)} 50%, transparent 80%)` }} />
      <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[11px] text-zinc-200 backdrop-blur-sm">
        <Loader2 size={11} className="animate-spin" /> {slow ? "Still loading the preview" : "Loading preview"}
      </span>
    </div>
  );
}

/** The sample site for a style, scaled into the card. It loads only when the card is near the screen. */
function Preview({ t }: { t: Template }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!near || ready) return;
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, [near, ready]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "300px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  const scale = w ? w / DESK_W : 0.25;
  return (
    <div ref={box} className="relative aspect-[16/10] overflow-hidden border-b border-white/[0.06]" style={{ background: t.bg }} aria-busy={!ready}>
      {!ready && <Loading t={t} slow={slow} />}
      {near && (
        <iframe
          src={`/styles/${t.style}`}
          title={`${THEME_LABELS[t.style]} sample site`}
          tabIndex={-1}
          loading="lazy"
          onLoad={() => setReady(true)}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: DESK_W, height: FRAME_H, transform: `scale(${scale})`, opacity: ready ? 1 : 0, transition: "opacity .4s ease-out", background: t.bg }}
        />
      )}
    </div>
  );
}

export function Gallery() {
  const [kind, setKind] = useState<TemplateKind | "all">("all");
  const [style, setStyle] = useState<ThemeId | "all">("all");
  const styles = [...new Set(TEMPLATES.map((t) => t.style))];
  const shown = TEMPLATES.filter((t) => (kind === "all" || t.kind === kind) && (style === "all" || t.style === style));
  const chip = (on: boolean) => `btn h-9 rounded-lg border px-3 text-[13px] ${on ? "border-white/25 bg-white/[0.1] text-white" : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-zinc-200"}`;

  return (
    <>
      <div className="mt-8 space-y-3">
        <div role="group" aria-label="Kind of site" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={kind === "all"} className={chip(kind === "all")} onClick={() => setKind("all")}>All</button>
          {TEMPLATE_KINDS.map((k) => <button key={k.id} type="button" aria-pressed={kind === k.id} className={chip(kind === k.id)} onClick={() => setKind(k.id)}>{k.label}</button>)}
        </div>
        <div role="group" aria-label="Style" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={style === "all"} className={chip(style === "all")} onClick={() => setStyle("all")}>Any style</button>
          {styles.map((s) => (
            <button key={s} type="button" aria-pressed={style === s} className={`${chip(style === s)} gap-2`} onClick={() => setStyle(s)}>
              <ThemeSwatch id={s} size={14} />{THEME_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <article key={t.key} className="panel overflow-hidden">
              <Preview t={t} />
              <div className="p-4">
                <h2 className="text-[16px] font-semibold text-white">{t.title}</h2>
                <p className="mt-1 text-[13px] text-zinc-400">{THEME_LABELS[t.style]} · {TEMPLATE_KINDS.find((k) => k.id === t.kind)!.label} · {CHAINS[t.chain].name}</p>
                <p className="mt-2 min-h-[40px] text-[13px] leading-relaxed text-zinc-500">{t.note}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={templateHref(t)} className="btn btn-primary h-10 px-4">Use template <ArrowRight size={15} /></Link>
                  <a href={`/styles/${t.style}`} target="_blank" rel="noreferrer" className="btn btn-outline h-10 px-4">Open full size <ArrowUpRight size={15} /></a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-[14px] text-zinc-500">No templates match both filters. <button type="button" className="text-white underline" onClick={() => { setKind("all"); setStyle("all"); }}>Show all</button></p>
      )}
    </>
  );
}
