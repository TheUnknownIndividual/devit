import { NextResponse } from "next/server";
import { recentTrades } from "@/lib/chain";
import type { Chain } from "@/lib/spec";

const CHAINS = new Set(["near", "solana", "ethereum", "robinhood"]);
const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(req: Request) {
  const u = new URL(req.url);
  const pool = u.searchParams.get("pool") ?? "";
  const chain = u.searchParams.get("chain") ?? "";
  if (!pool || !CHAINS.has(chain)) return NextResponse.json({ error: "pool and chain required" }, { status: 400 });
  const key = `${chain}:${pool}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 8_000) return NextResponse.json(hit.body);
  const body = { trades: await recentTrades(chain as Chain, pool) };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
