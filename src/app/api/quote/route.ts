import { NextResponse } from "next/server";
import { quote, SwapError } from "@/lib/swap";
import { CHAIN_IDS, type Chain } from "@/lib/spec";

const NEAR_ACCOUNT = /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/;

// Same-chain buy quotes: Jupiter on Solana, KyberSwap on the EVM chains, neartrade on NEAR.

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = u.searchParams.get("chain") as Chain | null;
  const token = u.searchParams.get("token") ?? "";
  const amount = Number(u.searchParams.get("amount"));
  const decimals = Number(u.searchParams.get("decimals") ?? "6");
  if (!token || !(amount > 0) || amount > 1e9) return NextResponse.json({ error: "token and amount required" }, { status: 400 });

  if (!chain || !(CHAIN_IDS as readonly string[]).includes(chain)) return NextResponse.json({ error: "unknown chain" }, { status: 400 });
  const account = chain === "near" ? u.searchParams.get("account") ?? undefined : undefined;
  if (account && !NEAR_ACCOUNT.test(account)) return NextResponse.json({ error: "bad account" }, { status: 400 });
  try {
    const q = await quote(chain, token, amount, decimals, account);
    return NextResponse.json({ venue: q.venue, out: q.out, impactPct: q.impactPct, swap: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof SwapError ? e.message : "No route right now" }, { status: 422 });
  }
}
