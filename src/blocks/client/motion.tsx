"use client";

import { useEffect, useRef } from "react";
import type { SiteSpec } from "@/lib/spec";
import type { Mode } from "./parts";
import { useTrades } from "./fomo";

// The moving half of the motion kit (blocks/motion.ts has the CSS). Live view only, nothing under reduced motion.
//  - Reveals: the model's [data-ss-reveal] elements, plus, in sections where it wrote none, the section's content
//    blocks below the first screen. Already-visible content is left alone so nothing blinks on load.
//  - Headlines: [data-ss-split], plus each section's main heading, split into words that slide up in turn.
//  - [data-ss-tilt] follows the pointer; [data-ss-parallax="0.15"] drifts with the scroll.
//  - The market pulse: a real trade after the page opened sets data-ss-pulse="buy|sell" on the root for a moment
//    (the CSS sweeps the bottom edge; the model's CSS may react too) and flashes the live numbers.

const SKIP_TAGS = new Set(["STYLE", "SCRIPT", "TEMPLATE", "BR"]);

function still(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The element holding a section's content: down through single-child wrappers, at most three levels. */
function contentOf(sec: HTMLElement): HTMLElement {
  let el = sec;
  for (let i = 0; i < 3; i++) {
    const kids = [...el.children].filter((k) => !SKIP_TAGS.has(k.tagName)) as HTMLElement[];
    if (kids.length !== 1) break;
    el = kids[0];
  }
  return el;
}

function isHeader(sec: HTMLElement, i: number): boolean {
  return i === 0 && (!!sec.querySelector("nav") || sec.offsetHeight < 160);
}

/** Wraps each word of el's text in <span class="ss-w"><span>word</span></span>, keeping child elements. */
function splitWords(el: HTMLElement): void {
  if (el.dataset.ssSplitDone) return;
  el.dataset.ssSplitDone = "1";
  let w = 0;
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? "").split(/(\s+)/);
        if (parts.every((p) => !p.trim())) continue;
        const frag = document.createDocumentFragment();
        for (const p of parts) {
          if (!p) continue;
          if (!p.trim()) { frag.append(p); continue; }
          const outer = document.createElement("span");
          outer.className = "ss-w";
          const inner = document.createElement("span");
          inner.textContent = p;
          outer.style.setProperty("--w", String(Math.min(w++, 14)));
          outer.append(inner);
          frag.append(outer);
        }
        child.replaceWith(frag);
      } else if (child instanceof HTMLElement && !child.matches("[data-ss-widget], [data-ss-bind], svg, img")) walk(child);
    }
  };
  walk(el);
}

/** A heading we can split safely: short, plain text, not painted with background-clip:text. */
function splittable(h: HTMLElement): boolean {
  const text = (h.textContent ?? "").trim();
  if (!text || text.length > 90 || h.closest("[data-ss-widget]")) return false;
  const cs = getComputedStyle(h);
  if (cs.backgroundClip === "text" || cs.getPropertyValue("-webkit-background-clip") === "text") return false;
  // Letter-by-letter markup (one span per character) is already its own effect.
  if (h.querySelectorAll("*").length > 6) return false;
  return true;
}

export function CodeMotion({ rootId, mode, spec }: { rootId: string; mode: Mode; spec: SiteSpec }) {
  const live = mode === "live";

  // Reveals, headline splits, tilt and parallax. Re-run when the sections change.
  useEffect(() => {
    const body = document.getElementById(rootId);
    const root = body?.closest<HTMLElement>(".ss-code");
    if (!body || !root || !live) return;
    if (still()) { root.setAttribute("data-ss-ready", ""); return; }
    const fold = innerHeight * 0.92;
    const secs = [...body.querySelectorAll<HTMLElement>(":scope > section")];

    secs.forEach((sec, i) => {
      if (isHeader(sec, i)) return;
      // Main heading of the section: split into words (an h1 waits hidden for the kit, see MOTION_CSS).
      const h = sec.querySelector<HTMLElement>("h1, h2");
      if (h && !h.hasAttribute("data-ss-split") && splittable(h)) h.setAttribute("data-ss-split", "");
      // Auto reveals only where the model wrote none, and only below the first screen.
      if (sec.querySelector("[data-ss-reveal]")) return;
      const kids = [...contentOf(sec).children].filter((k) => !SKIP_TAGS.has(k.tagName)) as HTMLElement[];
      let n = 0;
      for (const k of kids) {
        const pos = getComputedStyle(k).position;
        if (pos === "absolute" || pos === "fixed" || k.offsetHeight === 0) continue;
        if (k.getBoundingClientRect().top < fold) continue;
        k.setAttribute("data-ss-reveal", "");
        k.style.setProperty("--i", String(Math.min(n++, 6)));
      }
    });

    for (const el of body.querySelectorAll<HTMLElement>("[data-ss-split]")) splitWords(el);
    root.setAttribute("data-ss-ready", "");

    // Anything already on screen comes in at once; the rest waits for the scroll.
    const targets = [...body.querySelectorAll<HTMLElement>("[data-ss-reveal], [data-ss-split]")];
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    // A frame later, so the hidden state paints first and the entrance actually animates.
    const raf0 = requestAnimationFrame(() => targets.forEach((el) => io.observe(el)));

    // Pointer tilt (fine pointers only).
    const tilts = matchMedia("(pointer: fine)").matches ? [...body.querySelectorAll<HTMLElement>("[data-ss-tilt]")] : [];
    const offs = tilts.map((el) => {
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
      };
      const leave = () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
    });

    // Parallax: transform-free (uses translate), one rAF per scroll.
    const drift = [...body.querySelectorAll<HTMLElement>("[data-ss-parallax]")];
    let raf = 0;
    const frame = () => {
      raf = 0;
      for (const el of drift) {
        const k = Math.max(-0.5, Math.min(0.5, Number(el.dataset.ssParallax) || 0.15));
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) continue;
        el.style.translate = `0 ${((r.top + r.height / 2 - innerHeight / 2) * -k).toFixed(1)}px`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    if (drift.length) { frame(); addEventListener("scroll", onScroll, { passive: true }); }

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf0);
      offs.forEach((off) => off());
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [rootId, live, spec.blocks]);

  // The market pulse: trades that arrive after the page opened.
  const trades = useTrades(live && spec.token?.pairAddress ? spec.token : null, mode);
  const newest = useRef<number | null>(null);
  useEffect(() => {
    if (!live || !trades?.length) return;
    const top = trades[0];
    if (newest.current == null) { newest.current = top.at; return; }
    if (top.at <= newest.current) return;
    newest.current = top.at;
    const root = document.getElementById(rootId)?.closest<HTMLElement>(".ss-code");
    if (!root || still()) return;
    root.removeAttribute("data-ss-pulse");
    void root.offsetWidth; // restart the animation for back-to-back trades
    root.setAttribute("data-ss-pulse", top.side);
    root.style.setProperty("--ss-pulse-usd", String(Math.round(top.usd)));
    const cls = top.side === "buy" ? "ss-flash-up" : "ss-flash-down";
    const nums = [...root.querySelectorAll<HTMLElement>("[data-ss-bind=price],[data-ss-bind=mcap],[data-ss-bind=marketCap]")];
    nums.forEach((el) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); });
    const h = setTimeout(() => { root.removeAttribute("data-ss-pulse"); nums.forEach((el) => el.classList.remove(cls)); }, 1500);
    return () => clearTimeout(h);
  }, [trades, live, rootId]);

  return null;
}
