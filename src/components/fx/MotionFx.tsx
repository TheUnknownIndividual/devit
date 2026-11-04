"use client";

import { useEffect } from "react";

// Page-wide motion that needs JS: reveal-on-scroll for [data-reveal], the cursor spotlight on .spot cards and the hero backdrop's cursor light.
export function MotionFx() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fx");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    const move = (e: PointerEvent) => {
      const hero = (e.target as Element | null)?.closest?.(".hero") as HTMLElement | null;
      if (hero) {
        const r = hero.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        hero.style.setProperty("--px", `${x}px`);
        hero.style.setProperty("--py", `${y}px`);
        hero.style.setProperty("--hx", (x / r.width).toFixed(3));
        hero.style.setProperty("--hy", (y / r.height).toFixed(3));
      }
      const el = (e.target as Element | null)?.closest?.(".spot") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => { io.disconnect(); document.removeEventListener("pointermove", move); root.classList.remove("fx"); };
  }, []);
  return null;
}
