import { NextResponse } from "next/server";
import { z } from "zod";
import { updateUser } from "@/lib/accounts";
import { editable } from "@/lib/access";
import { needsPlan, projectEntitled } from "@/lib/entitlements";
import { PAY_WITH, intentQuote, oneClickTokens } from "@/lib/intents";
import { overLimit } from "@/lib/net";
import { advanceOrder, orderView } from "@/lib/domain-orders";
import { buyingOn, quoteDomain } from "@/lib/spaceship";

// Buying a domain for this project: POST hands out a NEAR Intents deposit address for the price (any token, any
// chain, delivered as USDC on NEAR); GET moves the order along (lib/domain-orders.ts) and says where it is.

const USDC_NEAR = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

const Body = z.object({
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/).max(253),
  pay: z.enum(PAY_WITH.map((p) => p.key) as [string, ...string[]]),
  refundTo: z.string().trim().min(8).max(120),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "domain-buy", 10);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  if (!g.v.user) return NextResponse.json({ error: "Sign in first, so the domain lands on your account." }, { status: 401 });
  if (!(await projectEntitled(g.p, "customDomain"))) return needsPlan("customDomain");
  if (!buyingOn()) return NextResponse.json({ error: "Buying domains here is coming soon. Buy one on Spaceship and connect it below." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a coin and paste your refund address." }, { status: 400 });
  const b = parsed.data;
  const offer = await quoteDomain(b.domain);
  if (!offer || offer.total == null || offer.price == null) return NextResponse.json({ error: "That domain can't be bought right now." }, { status: 409 });
  const [bc, sym] = b.pay.split(":");
  const origin = (await oneClickTokens()).find((x) => x.blockchain === bc && x.symbol === sym);
  if (!origin?.price) return NextResponse.json({ error: "No price for that coin right now." }, { status: 502 });
  const amount = Number(((offer.total * 1.02) / origin.price).toPrecision(6));
  const q = await intentQuote({ pay: b.pay, amount, chain: "near", token: USDC_NEAR, recipient: process.env.PAYMENTS_NEAR_ACCOUNT!.trim(), refundTo: b.refundTo, dry: false });
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 502 });
  if (!q.depositAddress) return NextResponse.json({ error: "NEAR Intents didn't give a deposit address. Try again." }, { status: 502 });
  await updateUser(g.v.user.id, (u) => {
    u.domainOrders = [...(u.domainOrders ?? []).slice(-29), { depositAddress: q.depositAddress!, domain: b.domain, projectId: id, usd: offer.total!, cost: offer.price!, pay: b.pay, refundTo: b.refundTo, at: Date.now(), state: "awaiting" }];
  });
  return NextResponse.json({ depositAddress: q.depositAddress, amountIn: q.amountIn, symbol: sym, chain: PAY_WITH.find((x) => x.key === b.pay)!.chain, usd: offer.total, domain: b.domain, timeEstimate: q.timeEstimate });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  if (!g.v.user) return NextResponse.json({ orders: [] });
  const dep = new URL(req.url).searchParams.get("depositAddress");
  const mine = (g.v.user.domainOrders ?? []).filter((o) => o.projectId === id);
  if (dep) {
    if (!mine.some((o) => o.depositAddress === dep)) return NextResponse.json({ error: "not found" }, { status: 404 });
    const o = await advanceOrder(g.v.user.id, dep);
    return NextResponse.json({ order: o ? orderView(o) : null }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ orders: mine.slice(-5).reverse().map(orderView) }, { headers: { "cache-control": "no-store" } });
}
