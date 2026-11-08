"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Coins, KeyRound, LogIn, Sparkles, Zap } from "lucide-react";
import { Dialog } from "./Dialog";

// Shown when someone presses Build with no AI credits left. A line of text under the prompt is easy to miss, so a
// second press on the greyed-out button opens this: how much is left, when it comes back (counting down), and every
// way to keep going, the free one included.

export interface CreditsOut {
  signedIn: boolean;
  plan?: string;
  allowance?: number;
  per?: "day" | "month";
  resetsAt?: number;
  error?: string;
}

function until(ms: number): string {
  if (ms <= 0) return "any moment";
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.round(h / 24)} days`;
}

function Option({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/[0.06] text-zinc-200">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-white">{title}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-zinc-400">{body}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function OutOfCredits({ open, onClose, info }: { open: boolean; onClose: () => void; info: CreditsOut }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, [open]);
  const back = info.resetsAt ? until(info.resetsAt - now) : info.per === "month" ? "next month" : "tomorrow";
  const free = !info.plan || info.plan === "free";

  return (
    <Dialog open={open} onClose={onClose} title="You're out of AI credits" icon={<Coins size={15} />} width={520}>
      <div className="p-5">
        {/* The meter, empty */}
        <div className="rounded-[14px] border border-white/[0.08] bg-ink-850 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-zinc-300">{info.allowance ? `0 of ${info.allowance.toLocaleString("en-US")} credits left ${info.per === "day" ? "today" : "this month"}` : "No credits left"}</span>
            <span className="shrink-0 font-mono text-[12px] text-zinc-500">0%</span>
          </div>
          <div className="mt-2.5 h-2 rounded-sm bg-white/[0.06]" />
          <p className="mt-3 text-[12.5px] text-zinc-400">
            Your credits come back in <span className="font-medium text-white">{back}</span>. Until then, any of these keeps you building.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {!info.signedIn && (
            <Option icon={<LogIn size={16} />} title="Sign in" body="Signed-in accounts get their own daily credits instead of sharing this network's."
              action={<button type="button" className="btn btn-primary h-8 px-3 text-[12.5px]" onClick={() => { onClose(); window.dispatchEvent(new Event("sitesmith:signin")); }}>Sign in</button>} />
          )}
          {info.signedIn && (
            <Option icon={<Zap size={16} />} title="Top up credits" body="A pack from $5. Used only after your plan's credits, and it never expires."
              action={<Link href="/pricing#topup" className="btn btn-primary h-8 px-3 text-[12.5px]">Top up <ArrowUpRight size={13} /></Link>} />
          )}
          {free && (
            <Option icon={<Sparkles size={16} />} title="Go Pro" body="800 credits a month, priority models and build queue, and a custom domain."
              action={<Link href="/pricing#pro" className="btn btn-outline h-8 px-3 text-[12.5px]">See Pro <ArrowUpRight size={13} /></Link>} />
          )}
          {info.signedIn && (
            <Option icon={<KeyRound size={16} />} title="Use your own model key" body="Add a Claude, OpenAI or NEAR AI key and builds run on it without using credits."
              action={<Link href="/settings#keys" className="btn btn-outline h-8 px-3 text-[12.5px]">Add key</Link>} />
          )}
        </div>
      </div>
    </Dialog>
  );
}
