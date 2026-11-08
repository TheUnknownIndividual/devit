"use client";

import { AlertTriangle, AtSign, Blocks, BookOpen, Check, Coins, Compass, FileText, Link2, Loader2, Eye, Microscope, Minus, Palette, PenTool, Search, Wallet } from "lucide-react";
import type { BuildStep } from "@/lib/spec";

// The live log of a build: each step slides in as it starts, spins while running and settles with what it found.

const ICON: Record<string, typeof Search> = { intent: Search, chain: Link2, research: BookOpen, voice: AtSign, copy: FileText, style: Palette, blocks: Blocks, wallet: Wallet, understand: Microscope, direction: Compass, design: PenTool, review: Eye };
const PLANNED = ["intent", "chain", "research", "voice", "copy", "style", "blocks", "wallet", "understand", "direction", "design", "review"];
const PLANNED_TITLE: Record<string, string> = { intent: "Reading your request", chain: "Reading the chain", research: "Finding socials and the story", voice: "Reading their X", copy: "Writing the copy", style: "Picking a style", blocks: "Laying out blocks", wallet: "Wiring wallet and buy box", understand: "Understanding the project", direction: "Art direction", design: "Designing the site", review: "Reviewing the design" };

export function BuildSteps({ steps, building }: { steps: BuildStep[]; building: boolean }) {
  const done = steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  const first = steps[0]?.at;
  const last = steps[steps.length - 1]?.at;
  const secs = first && last ? Math.max(0.1, (last - first) / 1000) : null;
  const pending = building ? PLANNED.filter((id) => !steps.some((s) => s.id === id)) : [];
  const failed = steps.some((s) => s.state === "error");

  return (
    <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-ink-850">
      <div className="flex h-11 items-center gap-2 border-b border-white/[0.06] px-3.5">
        {building ? <Loader2 size={15} className="animate-spin text-sel" /> : failed ? <AlertTriangle size={15} className="text-amber-400" /> : <Coins size={15} className="text-lime" />}
        <span className="text-[13px] font-medium text-white">{building ? "Building your site" : failed ? "Built with a warning" : "Site built"}</span>
        <span className="ml-auto font-mono text-[11.5px] text-zinc-500">{building ? `${done}/${PLANNED.length}` : secs ? `${secs.toFixed(1)}s` : ""}</span>
      </div>
      <div className="h-[2px] bg-white/[0.04]">
        <div className="h-full bg-lime transition-[width] duration-500" style={{ width: `${Math.round((done / PLANNED.length) * 100)}%` }} />
      </div>
      <ol className="p-1.5">
        {steps.map((s) => {
          const Icon = ICON[s.id] ?? Search;
          return (
            <li key={s.id} className="flex animate-rise items-start gap-3 rounded-[10px] px-2 py-2">
              <span className="relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-ink-900">
                <Icon size={13} className="text-zinc-400" />
                <span className="absolute -bottom-1 -right-1">
                  {s.state === "running" && <Loader2 size={11} className="animate-spin text-sel" />}
                  {s.state === "done" && <span className="grid h-3 w-3 animate-pop place-items-center rounded-full bg-lime text-ink-950"><Check size={8} strokeWidth={4} /></span>}
                  {s.state === "skipped" && <span className="grid h-3 w-3 place-items-center rounded-full bg-zinc-600 text-ink-950"><Minus size={8} strokeWidth={4} /></span>}
                  {s.state === "error" && <span className="grid h-3 w-3 place-items-center rounded-full bg-amber-400 text-ink-950"><AlertTriangle size={8} strokeWidth={3} /></span>}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] ${s.state === "running" ? "text-white" : "text-zinc-200"}`}>{s.title}</div>
                {s.detail && <div className={`mt-0.5 animate-rise text-[12px] leading-snug ${s.state === "error" ? "text-amber-300" : "text-zinc-500"}`}>{s.detail}</div>}
                {s.state === "running" && !s.detail && <div className="mt-1.5 h-2 w-40 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.12),rgba(255,255,255,0.04))] bg-[length:200%_100%]" />}
              </div>
            </li>
          );
        })}
        {pending.map((id) => {
          const Icon = ICON[id];
          return (
            <li key={id} className="flex items-start gap-3 px-2 py-2 opacity-40">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-dashed border-white/[0.12]"><Icon size={13} className="text-zinc-500" /></span>
              <div className="text-[13px] text-zinc-400">{PLANNED_TITLE[id]}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
