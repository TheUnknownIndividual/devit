import { NextResponse } from "next/server";
import { z } from "zod";
import { updateUser, viewer } from "@/lib/accounts";
import { PAY_WITH, intentQuote, oneClickTokens } from "@/lib/intents";
import { PLANS, priceUsd } from "@/lib/plans";
import { overLimit } from "@/lib/net";

// Paying for a plan with any token on any chain: a NEAR Intents 1-Click quote that delivers USDC on NEAR to
// PAYMENTS_NEAR_ACCOUNT. We only hand out the quote's deposit address; we never move funds ourselves. The plan turns
// on when 1-Click reports the swap done.

const USDC_NEAR = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const ONECLICK = process.env.ONECLICK_URL || "https://1click.chaindefuser.com";

const Body = z.object({
  plan: z.enum(["pro", "team"]),
  cycle: z.enum(["monthly", "yearly"]),
  pay: z.enum(PAY_WITH.map((p) => p.key) as [string, ...string[]]),
  refundTo: z.string().trim().min(8).max(120),
});

export async function POST(req: Request) {
  const limited = overLimit(req, "billing", 20);
  if (limited) return limited;
  const to = process.env.PAYMENTS_NEAR_ACCOUNT?.trim();
  if (!to) return NextResponse.json({ error: "Paying for plans is coming soon." }, { status: 503 });
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first, so the plan lands on your account." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a coin and paste your refund address." }, { status: 400 });
  const b = parsed.data;
  const p = PLANS.find((x) => x.id === b.plan)!;
  const usd = priceUsd(p, b.cycle);
  const [bc, sym] = b.pay.split(":");
  const origin = (await oneClickTokens()).find((x) => x.blockchain === bc && x.symbol === sym);
  if (!origin?.price) return NextResponse.json({ error: "No price for that coin right now." }, { status: 502 });
  // A little over the price so swap fees and slippage don't leave the payment short.
  const amount = Number(((usd * 1.02) / origin.price).toPrecision(6));
  const q = await intentQuote({ pay: b.pay, amount, chain: "near", token: USDC_NEAR, recipient: to, refundTo: b.refundTo, dry: false });
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 502 });
  if (!q.depositAddress) return NextResponse.json({ error: "NEAR Intents didn't give a deposit address. Try again." }, { status: 502 });
  await updateUser(user.id, (u) => {
    u.payments = [...(u.payments ?? []).slice(-19), { depositAddress: q.depositAddress!, plan: b.plan, cycle: b.cycle, usd, pay: b.pay, at: Date.now() }];
  });
  return NextResponse.json({ depositAddress: q.depositAddress, amountIn: q.amountIn, symbol: sym, chain: PAY_WITH.find((x) => x.key === b.pay)!.chain, usd, amountOutUsd: q.amountOutUsd, timeEstimate: q.timeEstimate });
}

/** Where a payment is; turns the plan on the first time 1-Click says SUCCESS. */
export async function GET(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const dep = new URL(req.url).searchParams.get("depositAddress") ?? "";
  const pay = user.payments?.find((x) => x.depositAddress === dep);
  if (!pay) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (pay.status === "SUCCESS") return NextResponse.json({ status: "SUCCESS", plan: user.plan });
  const headers: Record<string, string> = {};
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  const j = await fetch(`${ONECLICK}/v0/status?depositAddress=${encodeURIComponent(dep)}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" })
    .then((r) => r.json() as Promise<{ status?: string }>).catch(() => ({ status: undefined }));
  const status = j.status ?? "UNKNOWN";
  const u = await updateUser(user.id, (u) => {
    const x = u.payments?.find((y) => y.depositAddress === dep);
    if (!x || x.status === "SUCCESS") return;
    x.status = status;
    if (status === "SUCCESS") {
      const from = Math.max(Date.now(), u.planUntil ?? 0);
      u.plan = x.plan;
      u.planUntil = from + (x.cycle === "yearly" ? 366 : 31) * 86_400_000;
    }
  });
  return NextResponse.json({ status, plan: u?.plan ?? user.plan });
}
