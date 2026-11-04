"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Undo2 } from "lucide-react";
import { setSessionUser } from "@/components/account/session";
import type { PublicUser } from "@/lib/accounts";
import { PLANS } from "@/lib/plans";

// Plan payments and their 1-Click status. Open ones are asked about every 10 s; the server turns the plan on when one
// lands in full (lib/billing.ts), and the fresh account comes back with the answer.

export type PaymentRow = PublicUser["payments"][number];

const FINAL = new Set(["SUCCESS", "REFUNDED", "FAILED"]);
const WATCH_MS = 3 * 86_400_000;
export const isOpen = (x: PaymentRow) => !x.settledAt && !FINAL.has(x.status ?? "") && Date.now() - x.at < WATCH_MS;

const when = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const coin = (pay: string) => pay.split(":")[1]?.replace(/^w(?=NEAR)/, "") ?? pay;

function state(x: PaymentRow): { text: string; tone: "ok" | "warn" | "wait" | "off" } {
  if (x.settledAt) return { text: "Paid, plan on", tone: "ok" };
  if (x.status === "SUCCESS") return { text: `Short: $${x.received ?? 0} of $${x.usd} arrived, plan not on`, tone: "warn" };
  if (x.status === "REFUNDED") return { text: "Refunded", tone: "off" };
  if (x.status === "FAILED") return { text: "Failed, refund on the way", tone: "warn" };
  if (x.status === "INCOMPLETE_DEPOSIT") return { text: "Deposit was short, send the rest or wait for the refund", tone: "warn" };
  if (!isOpen(x)) return { text: "Expired, nothing arrived", tone: "off" };
  if (x.status === "KNOWN_DEPOSIT_TX") return { text: "Deposit seen", tone: "wait" };
  if (x.status === "PROCESSING") return { text: "Swapping", tone: "wait" };
  return { text: "Waiting for your deposit", tone: "wait" };
}

const TONE = { ok: "text-lime", warn: "text-amber-200", wait: "text-zinc-300", off: "text-zinc-500" } as const;

export function Payments({ initial, onUser, only = "all" }: { initial: PaymentRow[]; onUser?: (u: PublicUser) => void; only?: "all" | "open" }) {
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [initial]);
  const open = rows.filter(isOpen).map((x) => x.depositAddress).join(",");

  useEffect(() => {
    if (!open) return;
    const tick = async () => {
      for (const dep of open.split(",")) {
        const j = await fetch(`/api/billing?depositAddress=${encodeURIComponent(dep)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        if (!j?.user) continue;
        setRows(j.user.payments);
        setSessionUser(j.user);
        onUser?.(j.user);
      }
    };
    const h = setInterval(() => void tick(), 10_000);
    return () => clearInterval(h);
  }, [open, onUser]);

  const list = [...rows].filter((x) => only === "all" || isOpen(x)).sort((a, b) => b.at - a.at);
  if (!list.length) return only === "all" ? <p className="text-[12.5px] text-zinc-500">No payments yet.</p> : null;
  return (
    <ul className="divide-y divide-white/[0.06] rounded-[12px] border border-white/[0.08]">
      {list.map((x) => {
        const s = state(x);
        const Icon = s.tone === "ok" ? CheckCircle2 : s.tone === "warn" ? AlertTriangle : s.tone === "off" ? (x.status === "REFUNDED" ? Undo2 : Clock) : Loader2;
        return (
          <li key={x.depositAddress} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white">{PLANS.find((p) => p.id === x.plan)?.name ?? x.plan} · {x.cycle === "yearly" ? "1 year" : "1 month"} · ${x.usd}</div>
              <div className="truncate text-[11.5px] text-zinc-500" title={x.depositAddress}>{when(x.at)} · paid in {coin(x.pay)} · {x.depositAddress.slice(0, 10)}…</div>
            </div>
            <span className={`flex items-center gap-1.5 text-[12px] ${TONE[s.tone]}`}>
              <Icon size={13} className={s.tone === "wait" ? "animate-spin" : undefined} /> {s.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
