import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, publicUser, updateUser, viewer } from "@/lib/accounts";
import { advanceCreditOrder } from "@/lib/credit-orders";
import { PAY_WITH, intentQuote, oneClickTokens } from "@/lib/intents";
import { CREDIT_PACKS, creditPack } from "@/lib/plans";
import { overLimit } from "@/lib/net";

// Buying a build pack with any token on any chain, the same way plans are paid: a NEAR Intents 1-Click quote that
// delivers USDC on NEAR to PAYMENTS_NEAR_ACCOUNT. POST hands out the deposit address; GET moves the order along
// (lib/credit-orders.ts) and adds the builds once the full amount lands. We never move funds ourselves.

const USDC_NEAR = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

const Body = z.object({
  pack: z.enum(CREDIT_PACKS.map((p) => p.id) as [string, ...string[]]),
  pay: z.enum(PAY_WITH.map((p) => p.key) as [string, ...string[]]),
  refundTo: z.string().trim().min(8).max(120),
});

export async function POST(req: Request) {
  const limited = overLimit(req, "billing", 20);
  if (limited) return limited;
  const to = process.env.PAYMENTS_NEAR_ACCOUNT?.trim();
  if (!to) return NextResponse.json({ error: "Buying build packs is coming soon." }, { status: 503 });
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first, so the builds land on your account." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a coin and paste your refund address." }, { status: 400 });
  const b = parsed.data;
  const pack = creditPack(b.pack)!;
  const [bc, sym] = b.pay.split(":");
  const origin = (await oneClickTokens()).find((x) => x.blockchain === bc && x.symbol === sym);
  if (!origin?.price) return NextResponse.json({ error: "No price for that coin right now." }, { status: 502 });
  // A little over the price so swap fees and slippage don't leave the payment short.
  const amount = Number(((pack.usd * 1.02) / origin.price).toPrecision(6));
  const q = await intentQuote({ pay: b.pay, amount, chain: "near", token: USDC_NEAR, recipient: to, refundTo: b.refundTo, dry: false });
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 502 });
  if (!q.depositAddress) return NextResponse.json({ error: "NEAR Intents didn't give a deposit address. Try again." }, { status: 502 });
  await updateUser(user.id, (u) => {
    u.creditOrders = [...(u.creditOrders ?? []).filter((o) => o.depositAddress !== q.depositAddress).slice(-29), { depositAddress: q.depositAddress!, pack: pack.id, builds: pack.builds, usd: pack.usd, pay: b.pay, refundTo: b.refundTo, at: Date.now(), state: "awaiting" }];
  });
  return NextResponse.json({ depositAddress: q.depositAddress, amountIn: q.amountIn, symbol: sym, chain: PAY_WITH.find((x) => x.key === b.pay)!.chain, usd: pack.usd, builds: pack.builds, timeEstimate: q.timeEstimate });
}

/** Where a pack order is; adds the builds the first time 1-Click says SUCCESS with the full amount delivered. */
export async function GET(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const dep = new URL(req.url).searchParams.get("depositAddress") ?? "";
  if (!(user.creditOrders ?? []).some((o) => o.depositAddress === dep)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const o = await advanceCreditOrder(user.id, dep);
  const fresh = await getUser(user.id);
  return NextResponse.json(
    { status: o?.status ?? "PENDING_DEPOSIT", state: o?.state ?? "awaiting", received: o?.received ?? null, usd: o?.usd, builds: o?.builds, error: o?.error ?? null, user: fresh ? publicUser(fresh) : null },
    { headers: { "cache-control": "no-store" } },
  );
}
