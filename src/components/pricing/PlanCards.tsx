"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Copy, Loader2, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { openSignIn, setSessionUser, useSession } from "@/components/account/session";
import { PLANS, priceUsd, type Cycle, type Plan, type PlanId } from "@/lib/plans";

export function PlanCards({ current, paymentsOn }: { current: PlanId | null; paymentsOn: boolean }) {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [paying, setPaying] = useState<Plan | null>(null);
  const { user } = useSession();

  return (
    <>
      <div className="mt-8 inline-flex items-center gap-1 rounded-[11px] border border-white/[0.07] bg-ink-900 p-0.5" role="radiogroup" aria-label="Billing">
        {(["monthly", "yearly"] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)} className={`btn h-8 ${cycle === c ? "bg-white/[0.09] text-white" : "btn-ghost"}`}>
            {c === "monthly" ? "Monthly" : "Yearly"}{c === "yearly" && <span className="text-[11px] text-lime">−20%</span>}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {PLANS.map((p) => {
          const price = cycle === "yearly" ? p.yearly : p.monthly;
          const isCurrent = current === p.id;
          return (
            <div key={p.id} id={p.id} className={`flex scroll-mt-6 flex-col rounded-2xl border bg-ink-900 p-5 ${p.id === "pro" ? "border-lime/40" : "border-white/[0.08]"}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-white">{p.name}</h2>
                {p.id === "pro" && <span className="rounded-md bg-lime/10 px-1.5 py-0.5 text-[11px] font-medium text-lime">Most picked</span>}
              </div>
              <p className="mt-1 text-[13px] text-zinc-400">{p.blurb}</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[34px] font-semibold tracking-[-0.03em] text-white">${price}</span>
                <span className="text-[13px] text-zinc-500">{p.monthly ? `/ month${p.seats > 1 ? `, ${p.seats} seats` : ""}` : "forever"}</span>
              </div>
              <p className="h-4 text-[11.5px] text-zinc-500">{p.monthly ? (cycle === "yearly" ? `$${priceUsd(p, "yearly")} billed yearly` : `or $${p.yearly}/mo billed yearly`) : ""}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {p.perks.map((x) => <li key={x} className="flex items-start gap-2 text-[13px] text-zinc-300"><Check size={14} className="mt-0.5 shrink-0 text-lime" /> {x}</li>)}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <button type="button" className="btn btn-outline w-full" disabled>Current plan</button>
                ) : p.id === "free" ? (
                  <Link href="/" className="btn btn-outline w-full">Start building <ArrowRight size={15} className="nudge-r" /></Link>
                ) : !paymentsOn ? (
                  <button type="button" className="btn btn-outline w-full" disabled>Coming soon</button>
                ) : (
                  <button type="button" className={`btn w-full ${p.id === "pro" ? "btn-primary" : "btn-outline"}`} onClick={() => (user ? setPaying(p) : openSignIn())}>
                    <Wallet size={15} /> Pay with any token
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {paying && <PayDialog plan={paying} cycle={cycle} onClose={() => setPaying(null)} />}
    </>
  );
}

interface Quote { depositAddress: string; amountIn: string; symbol: string; chain: string; usd: number }

function PayDialog({ plan, cycle, onClose }: { plan: Plan; cycle: Cycle; onClose: () => void }) {
  const [coins, setCoins] = useState<Array<{ key: string; label: string; chain: string }>>([]);
  const [pay, setPay] = useState("base:USDC");
  const [refundTo, setRefundTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ outcome: string; received: number | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetch("/api/intents").then((r) => r.json()).then((j) => setCoins(j.payWith ?? [])).catch(() => undefined); }, []);

  // Poll the deposit until 1-Click is done with it (or the dialog closes). The server turns the plan on.
  const done = status === "SUCCESS" || status === "REFUNDED" || status === "FAILED";
  useEffect(() => {
    if (!quote || done) return;
    const h = setInterval(async () => {
      const j = await fetch(`/api/billing?depositAddress=${encodeURIComponent(quote.depositAddress)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (j?.status) setStatus(j.status);
      if (j?.outcome) setOutcome({ outcome: j.outcome, received: j.received ?? null });
      if (j?.user) setSessionUser(j.user);
    }, 8000);
    return () => clearInterval(h);
  }, [quote, done]);
  const short = status === "SUCCESS" && outcome?.outcome === "short";

  const coin = coins.find((c) => c.key === pay);

  async function getQuote() {
    setBusy(true); setError(null);
    const r = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: plan.id, cycle, pay, refundTo: refundTo.trim() }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "No quote right now. Try again.");
    setQuote(j as Quote);
  }

  const WORDS: Record<string, string> = { PENDING_DEPOSIT: "Waiting for your deposit", KNOWN_DEPOSIT_TX: "Deposit seen", PROCESSING: "Swapping", SUCCESS: "Paid. Your plan is on.", INCOMPLETE_DEPOSIT: "The deposit was short", REFUNDED: "Refunded", FAILED: "Failed, refund on the way" };

  return (
    <Dialog open onClose={onClose} title={`${plan.name} · $${priceUsd(plan, cycle)} ${cycle === "yearly" ? "for a year" : "for a month"}`} icon={<Wallet size={15} />} width={460}>
      <div className="space-y-4 p-5">
        {!quote ? (
          <>
            <div>
              <label htmlFor="coin" className="mb-1.5 block text-[12px] text-zinc-400">Pay with</label>
              <select id="coin" className="field" value={pay} onChange={(e) => setPay(e.target.value)}>
                {coins.map((c) => <option key={c.key} value={c.key}>{c.label} on {c.chain}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="refund" className="mb-1.5 block text-[12px] text-zinc-400">Your {coin?.chain ?? ""} address, for a refund if the swap can&apos;t complete</label>
              <input id="refund" className="field font-mono text-[12.5px]" spellCheck={false} value={refundTo} onChange={(e) => setRefundTo(e.target.value)} placeholder="Address you'll pay from" />
            </div>
            <button type="button" className="btn btn-primary w-full" disabled={busy || refundTo.trim().length < 8} onClick={() => void getQuote()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Get deposit address
            </button>
            <p className="text-[11.5px] leading-relaxed text-zinc-500">NEAR Intents swaps what you send into USDC on NEAR. sitesmith never holds or moves your funds.</p>
          </>
        ) : (
          <>
            <p className="text-[13.5px] text-zinc-300">Send exactly <span className="font-semibold text-white">{quote.amountIn} {quote.symbol}</span> on {quote.chain} to:</p>
            <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.08] bg-ink-850 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-white">{quote.depositAddress}</code>
              <button type="button" className="btn btn-ghost btn-icon h-8 w-8 shrink-0" aria-label="Copy address" onClick={() => { void navigator.clipboard.writeText(quote.depositAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="flex items-center gap-2 text-[12.5px] text-zinc-400">
              {short ? <AlertTriangle size={14} className="text-amber-200" /> : status === "SUCCESS" ? <CheckCircle2 size={14} className="text-lime" /> : done ? <AlertTriangle size={14} className="text-zinc-400" /> : <Loader2 size={14} className="animate-spin" />}
              {short ? `Only $${outcome?.received ?? 0} of $${quote.usd} arrived, so the plan isn't on. Get in touch and we'll sort it out.` : WORDS[status ?? "PENDING_DEPOSIT"] ?? status}
            </p>
            <p className="text-[11.5px] text-zinc-500">This address is for this payment only and expires in an hour. Keep this window open, or come back to Settings; the plan turns on once the swap lands.</p>
          </>
        )}
        {error && <p role="alert" className="text-[12.5px] text-amber-200">{error}</p>}
      </div>
    </Dialog>
  );
}
