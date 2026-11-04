import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAIN_IDS } from "@/lib/spec";
import { build, SwapError } from "@/lib/swap";

// Builds the unsigned buy transaction for a visitor's wallet. Nothing is signed or sent here.

const NEAR_ACCOUNT = /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/;
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

const Body = z.object({
  chain: z.enum(CHAIN_IDS),
  token: z.string().min(2).max(64),
  amount: z.number().positive().max(1e6),
  decimals: z.number().int().min(0).max(36),
  user: z.string().min(2).max(64),
});

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "chain, token, amount, decimals and user required" }, { status: 400 });
  const b = p.data;
  const ok = b.chain === "near"
    ? NEAR_ACCOUNT.test(b.user) && NEAR_ACCOUNT.test(b.token)
    : b.chain === "solana"
      ? SOL.test(b.user) && SOL.test(b.token)
      : EVM.test(b.user) && EVM.test(b.token);
  if (!ok) {
    return NextResponse.json({ error: "That address doesn't match the chain." }, { status: 400 });
  }
  try {
    return NextResponse.json(await build(b.chain, b.token, b.amount, b.decimals, b.user));
  } catch (e) {
    return NextResponse.json({ error: e instanceof SwapError ? e.message : "Couldn't build the swap." }, { status: 502 });
  }
}
