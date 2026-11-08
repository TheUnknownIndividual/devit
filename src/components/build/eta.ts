"use client";

import { useEffect, useRef, useState } from "react";
import type { BuildEta, BuildStep } from "@/lib/spec";

// How far along a build is and how long it has left, from the steps the server writes and how long each step took
// in recent builds (BuildEta.plan, medians). Weighted by time, not by step count: "5 of 12" said nothing about the
// two minutes of design still to come. The estimate is smoothed so it counts down steadily and rarely jumps back.

export interface BuildProgress {
  /** 0–100, never goes backwards while a build runs. */
  pct: number;
  leftMs: number;
  /** "About 2 min left", "About 40s left", "Almost done". */
  label: string;
  /** What is happening right now, in plain words. */
  phase: string;
  /** The step running now. */
  current: string | null;
  /** Steps in the order the build runs them. */
  planned: string[];
  /** Sections written so far / planned, while the design is being written. */
  sections: { done: number; of: number } | null;
  elapsedMs: number;
  /** Running well past the estimate. */
  slow: boolean;
}

export const PHASE: Record<string, string> = {
  intent: "Reading what you asked for",
  chain: "Reading the token from the chain: price, holders, launchpad",
  research: "Finding the project's links and story online",
  voice: "Reading their posts to learn how they talk",
  reference: "Studying the reference site",
  copy: "Writing the copy",
  style: "Picking a style",
  blocks: "Laying out the page",
  wallet: "Wiring the wallet and buy box to the live token",
  understand: "Reading everything found to work out what the project is",
  direction: "Choosing the concept, fonts, colours and sections",
  design: "Writing the site, one section at a time",
  review: "Opening it in a browser at desktop and phone width to fix layout faults",
};

const FALLBACK_PLAN: Record<string, number> = { intent: 500, chain: 1500, research: 1500, voice: 800, wallet: 500, understand: 20000, direction: 25000, design: 75000, review: 15000 };

function sectionsOf(s: BuildStep | undefined): { done: number; of: number } | null {
  const m = s?.detail?.match(/\((\d+) of (\d+)\)/);
  return m ? { done: Number(m[1]), of: Number(m[2]) } : null;
}

function rawLeft(steps: BuildStep[], plan: Record<string, number>, now: number): number {
  let left = 0;
  for (const [id, ms] of Object.entries(plan)) {
    const s = steps.find((x) => x.id === id);
    if (!s) { left += ms; continue; }
    if (s.state !== "running") continue;
    const ran = now - (s.began ?? s.at);
    let rem = ms - ran;
    const sec = id === "design" ? sectionsOf(s) : null;
    if (sec && sec.done >= 2 && sec.of > sec.done) {
      // The pace of the sections written so far says more than the history once a couple are in.
      const byPace = (ran / sec.done) * (sec.of - sec.done);
      rem = sec.done >= 4 ? byPace : (rem + byPace) / 2;
    }
    left += Math.max(rem, Math.min(ms * 0.15, 8000));
  }
  return left;
}

export function etaLabel(ms: number): string {
  if (ms < 12_000) return "Almost done";
  if (ms < 90_000) return `About ${Math.max(15, Math.round(ms / 5000) * 5)}s left`;
  const min = Math.round(ms / 30_000) / 2;
  return `About ${min % 1 ? min.toFixed(1) : min} min left`;
}

/** Ticks once a second while the build runs. Null when nothing is building. */
export function useBuildProgress(p: { status: string; steps: BuildStep[]; eta?: BuildEta | null }): BuildProgress | null {
  const building = p.status === "building";
  const [now, setNow] = useState(() => Date.now());
  const shown = useRef<{ left: number; at: number; pct: number } | null>(null);

  useEffect(() => {
    if (!building) { shown.current = null; return; }
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [building]);

  if (!building) return null;
  const plan = p.eta?.plan && Object.keys(p.eta.plan).length ? p.eta.plan : FALLBACK_PLAN;
  const planned = Object.keys(plan);
  const started = p.eta?.startedAt ?? p.steps[0]?.began ?? p.steps[0]?.at ?? now;
  const elapsed = Math.max(0, now - started);
  const raw = rawLeft(p.steps, plan, now);

  // Smooth: good news shows at once; bad news creeps in, so the countdown doesn't lurch backwards on one slow step.
  const prev = shown.current;
  let left = raw;
  if (prev) {
    const counted = Math.max(0, prev.left - (now - prev.at));
    left = raw <= counted ? raw : counted + (raw - counted) * 0.25;
  }
  const pct = Math.max(prev?.pct ?? 0, Math.min(99, (elapsed / Math.max(1, elapsed + left)) * 100));
  shown.current = { left, at: now, pct };

  const running = [...p.steps].reverse().find((s) => s.state === "running" && planned.includes(s.id)) ?? null;
  const designStep = p.steps.find((s) => s.id === "design");
  const sections = designStep?.state === "running" ? sectionsOf(designStep) : null;
  const next = planned.find((id) => !p.steps.some((s) => s.id === id));
  const current = running?.id ?? next ?? null;
  let phase = current ? PHASE[current] ?? running?.title ?? "Working" : "Finishing up";
  if (current === "design") phase = sections ? `Writing the site: section ${Math.min(sections.done + 1, sections.of)} of ${sections.of}` : "Setting up the site's type, colours and base styles";
  const total = Object.values(plan).reduce((a, b) => a + b, 0);
  const slow = elapsed > total * 1.3 && left < 15_000;

  return { pct, leftMs: left, label: slow ? "Taking a little longer than usual" : etaLabel(left), phase, current, planned, sections, elapsedMs: elapsed, slow };
}

export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
