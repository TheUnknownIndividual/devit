import { promises as fs } from "node:fs";
import path from "node:path";
import type { BuildStep } from "./spec";

// How long builds really take, step by step, so the builder can show an honest countdown. The last builds of each
// kind are kept (a generated-code design, or the block site when no model is available); each step's expected time
// is the median of those. Until there is history, the defaults below (measured on production, Nov 2026) are used.

export type BuildMode = "design" | "blocks";

export const STEPS: Record<BuildMode, string[]> = {
  design: ["intent", "chain", "research", "voice", "wallet", "understand", "direction", "design", "review"],
  blocks: ["intent", "chain", "research", "voice", "reference", "copy", "style", "blocks", "wallet"],
};

const DEFAULTS: Record<string, number> = {
  intent: 500, chain: 1500, research: 1500, voice: 800, reference: 1000, copy: 30_000, style: 500, blocks: 500, wallet: 500,
  understand: 20_000, direction: 25_000, design: 75_000, review: 15_000,
};

const FILE = path.join(process.cwd(), "data", "build-times.json");
const KEEP = 20;

interface Rec { mode: BuildMode; at: number; steps: Record<string, number> }

async function read(): Promise<Rec[]> {
  try {
    const list = JSON.parse(await fs.readFile(FILE, "utf8")) as Rec[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Expected milliseconds for each visible step of a build of this kind. */
export async function etaPlan(mode: BuildMode): Promise<Record<string, number>> {
  const recent = (await read()).filter((r) => r.mode === mode).slice(-KEEP);
  const plan: Record<string, number> = {};
  for (const id of STEPS[mode]) {
    const seen = recent.map((r) => r.steps[id]).filter((v): v is number => typeof v === "number" && v >= 0);
    plan[id] = Math.round(seen.length >= 3 ? median(seen) : DEFAULTS[id] ?? 1000);
  }
  return plan;
}

/** Adds a finished build's step times to the history. Never throws. */
export async function recordBuild(mode: BuildMode, steps: BuildStep[]): Promise<void> {
  try {
    const times: Record<string, number> = {};
    for (const s of steps) if (s.began && (s.state === "done" || s.state === "skipped")) times[s.id] = Math.max(0, s.at - s.began);
    if (!Object.keys(times).length) return;
    const list = [...(await read()), { mode, at: Date.now(), steps: times }].slice(-KEEP * 3);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(list));
    await fs.rename(tmp, FILE);
  } catch { /* the countdown falls back to defaults */ }
}
