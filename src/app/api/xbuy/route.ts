import { NextResponse } from "next/server";
import { z } from "zod";
import { oneClickTokens } from "@/lib/intents";
import { sponsorArmed, sponsorGas } from "@/lib/nearsponsor";
import { ftBalance, ftDecimals, legState, submitDeposit, xQuote, xState, xSwapLeg } from "@/lib/xbuy";
import { XCOINS, fromUnits } from "@/lib/xpay";

// Buy/sell a NEAR token from an Ethereum wallet (see lib/xbuy.ts). The server only quotes and builds; the visitor's
// wallet signs everything, and the coins stay in their own 0x account on NEAR.

const Evm = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
// A NEAR wallet's own account (named or implicit), for finishing a buy whose wNEAR landed there.
const NearAcct = z.string().regex(/^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/);
const Token = z.string().regex(/^[a-z0-9._-]{2,64}$/);
const Amount = z.string().regex(/^\d{1,40}$/);
const Pay = z.enum(XCOINS.map((c) => c.key) as [string, ...string[]]);

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("quote"), side: z.enum(["buy", "sell"]), pay: Pay, amount: Amount, token: Token, evm: Evm, dry: z.boolean() }),
  z.object({ op: z.literal("leg"), token: Token, evm: Evm.or(NearAcct) }),
  z.object({ op: z.literal("submit"), depositAddress: z.string().regex(/^[A-Za-z0-9._:-]{8,120}$/), txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$|^[1-9A-HJ-NP-Za-km-z]{32,90}$/) }),
  z.object({ op: z.literal("gas"), token: Token, evm: Evm }),
]);

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const near = NearAcct.safeParse(u.get("near")), tok = Token.safeParse(u.get("token"));
  if (u.get("near")) {
    if (!near.success || !tok.success) return NextResponse.json({ error: "near and token required" }, { status: 400 });
    return NextResponse.json(await legState(near.data.toLowerCase(), tok.data));
  }
  const evm = Evm.safeParse(u.get("evm")), token = Token.safeParse(u.get("token"));
  if (!evm.success || !token.success) return NextResponse.json({ error: "evm and token required" }, { status: 400 });
  return NextResponse.json({ ...(await xState(evm.data, token.data)), sponsor: sponsorArmed() });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const b = parsed.data;
  if (b.op === "quote") {
    const q = await xQuote(b);
    return NextResponse.json(q, { status: "error" in q ? 422 : 200 });
  }
  if (b.op === "leg") {
    const r = await xSwapLeg(b.evm, b.token);
    return NextResponse.json(r, { status: "error" in r ? 409 : 200 });
  }
  if (b.op === "submit") {
    await submitDeposit(b.depositAddress, b.txHash);
    return NextResponse.json({ ok: true });
  }
  // gas: a token worth under $1 (when 1-Click prices it) doesn't earn a top-up.
  const account = b.evm.toLowerCase();
  const hit = (await oneClickTokens()).find((x) => x.assetId === `nep141:${b.token}`);
  const usdOk = hit ? fromUnits(await ftBalance(b.token, account), hit.decimals ?? (await ftDecimals(b.token))) * hit.price >= 1 : true;
  const r = await sponsorGas(account, b.token, usdOk);
  return NextResponse.json(r, { status: "error" in r ? 409 : 200 });
}
