"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// A first-visit walkthrough: each step lights up one part of the page (found by a [data-tour] selector) and points
// at it with a card. Shown once per browser per page; restartTour(id) shows it again.

export interface TourStep { sel: string; title: string; body: string }

const KEY = (id: string) => `sitesmith:tour:${id}`;
const EVENT = "sitesmith:tour";

export function restartTour(id: string) {
  try { localStorage.removeItem(KEY(id)); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

export const LANDING_TOUR: TourStep[] = [
  { sel: "#prompt", title: "Start with one sentence", body: "Say what you're launching and the look you want, like “retro arcade site for $PIXEL on Solana”. Paste a contract address and it pulls in live price, chart and trades." },
  { sel: '[data-tour="kinds"]', title: "Pick what you're making", body: "A memecoin site, a dApp landing page or an NFT mint. It changes the sections the agent starts with." },
  { sel: '[data-tour="options"]', title: "Chain and style", body: "Choose the chain your token lives on and a style, or leave Style on auto and let it pick from your words." },
  { sel: '[data-tour="import"]', title: "Start from GitHub or Figma", body: "Paste a public repo or a Figma file link and the agent reads its description, README or colours first." },
  { sel: '[data-tour="plan"]', title: "Plan before it builds", body: "Turn on Plan to see the sections and style it would use, switch any off, then build." },
  { sel: '[data-tour="build"]', title: "Build", body: "Your site appears in about a minute, with a live preview you can click on and change." },
];

export const BUILDER_TOUR: TourStep[] = [
  { sel: '[data-tour="preview"]', title: "Your site, live", body: "This is the real site. Double-click any text to type over it; nothing else changes." },
  { sel: '[data-tour="select"]', title: "Point at what to change", body: "With Select on, click a block (or drag over several) and say what should change. Only those blocks are edited." },
  { sel: '[data-tour="composer"]', title: "Edit, Plan or Ask", body: "Edit changes the site. Plan says what it would change and waits for your go. Ask answers questions and changes nothing." },
  { sel: '[data-tour="history"]', title: "Every version is kept", body: "Open History to preview any earlier version and restore it in one click." },
  { sel: '[data-tour="publish"]', title: "Publish when it's ready", body: "Put it live on your own subdomain, connect or buy a domain, or make it private." },
];

type Box = { top: number; left: number; width: number; height: number };

export function Tour({ id, steps, delay = 900 }: { id: string; steps: TourStep[]; delay?: number }) {
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [, tick] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(190);

  const live = steps.filter((s) => typeof document !== "undefined" && document.querySelector(s.sel));
  const step = live[i];

  useEffect(() => {
    let seen = true;
    try { seen = !!localStorage.getItem(KEY(id)); } catch { /* private mode */ }
    const t = seen ? 0 : window.setTimeout(() => { setI(0); setOn(true); }, delay);
    const again = (e: Event) => { if ((e as CustomEvent).detail === id) { setI(0); setOn(true); } };
    window.addEventListener(EVENT, again);
    return () => { clearTimeout(t); window.removeEventListener(EVENT, again); };
  }, [id, delay]);

  const done = useCallback(() => {
    setOn(false);
    try { localStorage.setItem(KEY(id), String(Date.now())); } catch { /* private mode */ }
  }, [id]);

  // Follow the target as the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!on || !step) return;
    const el = document.querySelector(step.sel);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const measure = () => { const r = el.getBoundingClientRect(); setBox({ top: r.top, left: r.left, width: r.width, height: r.height }); };
    measure();
    const re = () => { measure(); tick((n) => n + 1); };
    window.addEventListener("resize", re);
    window.addEventListener("scroll", re, true);
    const t = window.setInterval(measure, 400);
    return () => { window.removeEventListener("resize", re); window.removeEventListener("scroll", re, true); clearInterval(t); };
  }, [on, step]);

  // The card's real height (its text wraps differently per step and screen), so it is placed fully on screen.
  useLayoutEffect(() => { if (card.current) setCardH(card.current.offsetHeight); });

  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") done();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, live.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [on, done, live.length]);

  if (!on || !step || !box) return null;

  const pad = 6, M = 8, gap = 14;
  const vw = window.innerWidth, vh = window.innerHeight;
  // The lit-up box, kept inside the window: a tall target (the preview, the chat box at the bottom) is cut at the edges.
  const t0 = Math.max(M, box.top - pad), l0 = Math.max(M, box.left - pad);
  const hole = { top: t0, left: l0, width: Math.max(0, Math.min(vw - M, box.left + box.width + pad) - l0), height: Math.max(0, Math.min(vh - M, box.top + box.height + pad) - t0) };
  const W = Math.min(320, vw - 2 * M), H = Math.min(cardH, vh - 2 * M);
  // Below the target when it fits, else above, else beside it, else over it near the bottom; always fully on screen.
  const below = hole.top + hole.height + gap + H <= vh - M;
  const above = !below && hole.top - gap - H >= M;
  const right = hole.left + hole.width + gap + W <= vw - M, leftSide = hole.left - gap - W >= M;
  const side = !below && !above && (right || leftSide);
  const clampX = (x: number) => Math.min(Math.max(M, x), vw - W - M);
  const clampY = (y: number) => Math.min(Math.max(M, y), vh - H - M);
  const left = side ? (right ? hole.left + hole.width + gap : hole.left - gap - W) : clampX(hole.left + hole.width / 2 - W / 2);
  const top = below ? hole.top + hole.height + gap : above ? hole.top - gap - H : side ? clampY(hole.top + hole.height / 2 - H / 2) : vh - H - M;
  const arrow = below || above;
  const arrowX = Math.min(Math.max(16, hole.left + hole.width / 2 - left), W - 16);
  const last = i === live.length - 1;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      <div className="absolute inset-0" onClick={done} />
      {/* The lit-up target: a darker page around it, a solid 3px frame in the accent and a pulsing outer ring so it can't be missed. */}
      <div className="pointer-events-none absolute rounded-[12px] border-[3px] border-sel transition-all duration-300" style={{ ...hole, boxShadow: "0 0 0 4px rgba(124,156,255,0.35), 0 0 0 9999px rgba(3,4,10,0.78)" }} />
      <div className="tour-pulse pointer-events-none absolute rounded-[12px]" style={hole} />
      <div ref={card} className="absolute rounded-[14px] border border-sel/50 bg-ink-850 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)] transition-[top,left] duration-300" style={{ top, left, width: W }}>
        {arrow && <span className="absolute h-3 w-3 rotate-45 border-sel/50 bg-ink-850" style={{ left: arrowX - 6, ...(below ? { top: -6.5, borderLeftWidth: 1, borderTopWidth: 1 } : { bottom: -6.5, borderRightWidth: 1, borderBottomWidth: 1 }) }} />}
        <div className="overflow-y-auto" style={{ maxHeight: vh - 2 * M - 32 }}>
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[14px] font-semibold text-white">{step.title}</p>
          <button type="button" className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:text-white" aria-label="Close the tour" onClick={done}><X size={14} /></button>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-300">{step.body}</p>
        <div className="mt-3.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">{i + 1} of {live.length}</span>
          <button type="button" className="btn btn-ghost ml-auto h-8 px-2.5 text-[12px]" onClick={i === 0 ? done : () => setI(i - 1)}>{i === 0 ? "Skip" : "Back"}</button>
          <button type="button" className="btn btn-primary h-8 px-3 text-[12px]" autoFocus onClick={last ? done : () => setI(i + 1)}>{last ? "Got it" : "Next"}</button>
        </div>
        </div>
      </div>
    </div>
  );
}
