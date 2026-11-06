"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
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

  const pad = 6;
  const hole = { top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
  const W = 320, H = 180, vw = window.innerWidth, vh = window.innerHeight;
  // The card goes below the target when it fits, else above, else beside it; the arrow points back at the target.
  const below = hole.top + hole.height + 14 + H < vh;
  const above = hole.top - 14 - H > 0;
  const side = !below && !above;
  const left = side ? (hole.left + hole.width + 14 + W < vw ? hole.left + hole.width + 14 : Math.max(12, hole.left - W - 14)) : Math.min(Math.max(12, hole.left + hole.width / 2 - W / 2), vw - W - 12);
  const top = side ? Math.min(Math.max(12, hole.top + hole.height / 2 - H / 2), vh - H - 12) : below ? hole.top + hole.height + 14 : hole.top - 14 - H;
  const arrowX = Math.min(Math.max(16, hole.left + hole.width / 2 - left), W - 16);
  const last = i === live.length - 1;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      <div className="absolute inset-0" onClick={done} />
      <div className="pointer-events-none absolute rounded-[12px] ring-2 ring-sel transition-all duration-300" style={{ ...hole, boxShadow: "0 0 0 9999px rgba(3,4,10,0.62)" }} />
      <div className="absolute w-[320px] rounded-[14px] border border-white/10 bg-ink-850 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)] transition-all duration-300" style={{ top: below || side ? top : undefined, bottom: !below && !side ? vh - (hole.top - 14) : undefined, left }}>
        {!side && <span className="absolute h-3 w-3 rotate-45 border-white/10 bg-ink-850" style={{ left: arrowX - 6, ...(below ? { top: -6.5, borderLeftWidth: 1, borderTopWidth: 1 } : { bottom: -6.5, borderRightWidth: 1, borderBottomWidth: 1 }) }} />}
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[14px] font-semibold text-white">{step.title}</p>
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
  );
}
