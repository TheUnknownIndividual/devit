"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { SHOWCASE_LIST } from "@/lib/showcase";
import { THEME_LABELS, THEME_NOTES } from "@/lib/themes";
import { CHAINS, type ThemeId } from "@/lib/spec";

// "Start from a style": the real sample site for each style in a browser frame (AlignUI's template section),
// tabs that advance on their own with a progress bar (Across' integrator tabs), and a slow scroll through
// the page while you hover. The frames are same-origin /styles/<id> pages rendered by the block library.

const STEP_MS = 6500;
const DESK_W = 1280;
const PHONE_W = 390;

export function StyleShowcase() {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [ready, setReady] = useState<Set<number>>(() => new Set());
  const [inView, setInView] = useState(false);
  const [hover, setHover] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [reduced, setReduced] = useState(false);
  const [cycle, setCycle] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frames = useRef<Array<HTMLIFrameElement | null>>([]);
  const item = SHOWCASE_LIST[active];

  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  // Frames load only once the section is near the screen, then the active one and the next.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!inView) return;
    setLoaded((s) => (s.has(active) && s.has((active + 1) % SHOWCASE_LIST.length) ? s : new Set([...s, active, (active + 1) % SHOWCASE_LIST.length])));
  }, [inView, active]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-advance while visible and not hovered; a click restarts the bar on the chosen style.
  useEffect(() => {
    if (!inView || hover || reduced) return;
    const h = setTimeout(() => setActive((a) => (a + 1) % SHOWCASE_LIST.length), STEP_MS);
    return () => clearTimeout(h);
  }, [active, inView, hover, reduced, cycle]);

  // Hovering the frame scrolls slowly down the sample site so its sections reveal; leaving goes back up.
  useEffect(() => {
    const w = frames.current[active]?.contentWindow;
    if (!w) return;
    if (!hover || reduced) {
      try { w.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* not loaded yet */ }
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      try { w.scrollBy(0, Math.min(40, t - last) * 0.09); } catch { return; }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hover, active, reduced, ready]);

  const phone = box.w > 0 && box.w < 560;
  const vw = phone ? PHONE_W : DESK_W;
  const scale = box.w ? box.w / vw : 1;

  function pick(i: number) {
    setActive(i);
    setCycle((c) => c + 1);
  }
  function use() {
    window.dispatchEvent(new CustomEvent("sitesmith:prompt", { detail: { style: item.id, prompt: item.prompt } }));
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div ref={root}>
      <div role="tablist" aria-label="Styles" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {SHOWCASE_LIST.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(i)}
              className={`relative flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full border pl-1.5 pr-3.5 text-[13px] transition-[background-color,border-color,color,transform] duration-200 [transition-timing-function:var(--ease-out)] active:scale-[.97] ${on ? "border-white/20 bg-white/[0.09] text-white" : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-zinc-200"}`}
            >
              <img src={s.logo} alt="" aria-hidden className="size-7 rounded-full object-cover ring-1 ring-white/10" />
              {THEME_LABELS[s.id as ThemeId]}
              {on && !reduced && (
                <span
                  key={`${active}-${cycle}`}
                  aria-hidden
                  className="absolute inset-x-3 bottom-0 h-[2px] origin-left rounded-full bg-white/70"
                  style={{ animation: `showcaseBar ${STEP_MS}ms linear both`, animationPlayState: hover || !inView ? "paused" : "running" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="panel mt-4 overflow-hidden" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="flex h-11 items-center gap-3 border-b border-white/[0.06] px-4">
          <span aria-hidden className="flex gap-1.5">{[0, 1, 2].map((d) => <span key={d} className="size-2.5 rounded-full bg-white/[0.12]" />)}</span>
          <span className="mx-auto flex min-w-0 items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1 text-[12px] text-zinc-400">
            <span className="truncate">{item.ticker.toLowerCase()}.sample.site</span>
          </span>
          <span className="hidden text-[12px] text-zinc-500 sm:block">{CHAINS[item.chain].name}</span>
        </div>

        <div ref={stage} className="relative h-[560px] overflow-hidden max-sm:h-[520px]" style={{ background: item.bg }}>
          {SHOWCASE_LIST.map((s, i) => loaded.has(i) && (
            <iframe
              key={s.id}
              ref={(el) => { frames.current[i] = el; }}
              src={`/styles/${s.id}`}
              title={`${THEME_LABELS[s.id as ThemeId]} sample site`}
              tabIndex={-1}
              aria-hidden={i !== active}
              loading="lazy"
              onLoad={() => setReady((r) => new Set([...r, i]))}
              className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
              style={{
                width: vw,
                height: box.h / scale || 560,
                transform: `scale(${scale})`,
                opacity: i === active && ready.has(i) ? 1 : 0,
                transition: "opacity .6s cubic-bezier(.6,.6,0,1)",
                background: s.bg,
              }}
            />
          ))}
          {!ready.has(active) && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-[13px] text-zinc-500" style={{ color: item.dark ? undefined : "#71717a" }}>Loading ${item.ticker}…</span>
            </div>
          )}

          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-5 flex flex-wrap items-center justify-center gap-2 px-4">
            <button type="button" onClick={use} className="btn btn-primary h-10 px-4">
              Use {THEME_LABELS[item.id as ThemeId]} <ArrowRight size={15} />
            </button>
            <a href={`/styles/${item.id}`} target="_blank" rel="noreferrer" className="btn h-10 border border-white/10 bg-ink-900/80 px-4 text-zinc-200 backdrop-blur hover:border-white/20 hover:text-white">
              Open full size <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-zinc-500">
        <span className="text-zinc-300">{THEME_LABELS[item.id as ThemeId]}:</span> {THEME_NOTES[item.id as ThemeId]}. Sample site with a made-up token; hover to scroll it.
      </p>
    </div>
  );
}
