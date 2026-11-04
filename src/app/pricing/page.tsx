import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { TopBar } from "@/components/account/TopBar";
import { PlanCards } from "@/components/pricing/PlanCards";
import { BrandIcon, BRANDS } from "@/components/brand";
import { COMPARE, FAQ, PLANS } from "@/lib/plans";
import { activePlan, viewer } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing · sitesmith" };

export default async function Pricing() {
  const { user } = await viewer();
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[1040px] px-5 pb-24 pt-10">
        <div className="max-w-[620px]">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[40px]">Pricing</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            Start free. Upgrade when the site is the real thing. Pay with any token on any chain through NEAR Intents, no card needed.
          </p>
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-zinc-500"><BrandIcon icon={BRANDS.near} size={13} color="#a1a1aa" /> Settles in USDC on NEAR. SOL, ETH, BTC, USDC, USDT and NEAR accepted.</p>
        </div>

        <PlanCards current={user ? activePlan(user) : null} paymentsOn={!!process.env.PAYMENTS_NEAR_ACCOUNT?.trim()} />

        <section className="mt-16" aria-labelledby="compare">
          <h2 id="compare" className="text-[18px] font-semibold text-white">Compare plans</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900">
            <table className="w-full table-fixed text-left text-[12.5px] sm:text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.07] text-zinc-400">
                  <th className="w-[38%] px-3 py-3 font-medium sm:px-4">Feature</th>
                  {PLANS.map((p) => <th key={p.id} className="px-2 py-3 font-medium text-white sm:px-4">{p.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {COMPARE.map((row) => (
                  <tr key={row.label}>
                    <td className="px-3 py-3 text-zinc-300 sm:px-4">{row.label}</td>
                    {PLANS.map((p) => {
                      const v = row.values[p.id];
                      return (
                        <td key={p.id} className="break-words px-2 py-3 text-zinc-300 sm:px-4">
                          {v === true ? <Check size={15} className="text-lime" aria-label="Included" /> : v === false ? <Minus size={15} className="text-zinc-600" aria-label="Not included" /> : v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] text-zinc-500">* Within fair use. Builds on your own API key never count toward a limit.</p>
        </section>

        <section className="mt-16" aria-labelledby="faq">
          <h2 id="faq" className="text-[18px] font-semibold text-white">Questions</h2>
          <div className="mt-4 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-ink-900">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-4 py-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium text-white [&::-webkit-details-marker]:hidden">
                  {f.q}<span className="text-zinc-500 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
