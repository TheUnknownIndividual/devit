"use client";

import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";

// What a refused Pro/Team request looks like in place: the 402 body from needsPlan() (lib/entitlements.ts), or a
// build limit with an upgrade hint. Render it where the action's error would go.

/** topup: out of AI credits, so a credit pack is offered (next to the plan, when there's one to go up to). */
export interface PlanRefusal { error: string; upgrade?: string; feature?: string; topup?: boolean }

/** The body as an upsell, when it is one. */
export const refusalOf = (j: unknown): PlanRefusal | null => {
  const o = j as Partial<PlanRefusal> | null;
  return o && typeof o.error === "string" && (typeof o.upgrade === "string" || o.topup === true) ? (o as PlanRefusal) : null;
};

export function Upsell({ body, className = "" }: { body: PlanRefusal; className?: string }) {
  const name = body.upgrade === "team" ? "Team" : "Pro";
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-white/[0.08] bg-ink-850 px-3 py-2 ${className}`}>
      <Lock size={14} className="shrink-0 text-zinc-400" />
      <p className="min-w-0 flex-1 text-[12.5px] text-zinc-300">{body.error}</p>
      {body.topup && <Link href="/pricing#topup" className="btn btn-outline h-7 px-2.5 text-[12px]">Top up <ArrowUpRight size={13} /></Link>}
      {body.upgrade && <Link href={`/pricing#${name.toLowerCase()}`} className="btn btn-outline h-7 px-2.5 text-[12px]">See {name} <ArrowUpRight size={13} /></Link>}
    </div>
  );
}
