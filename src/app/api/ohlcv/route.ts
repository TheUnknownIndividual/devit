import { NextResponse } from "next/server";
import { priceHistory, type PriceHistory } from "@/lib/chain";
import { CHAIN_IDS, type Chain } from "@/lib/spec";

const CHAINS = new Set<string>(CHAIN_IDS);
const cache = new Map<string, { at: number; body: PriceHistory }>();

// Past prices for the "what if you'd bought" block: public market data only, cached for five minutes.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const pool = u.searchParams.get("pool") ?? "";
  const chain = u.searchParams.get("chain") ?? "";
  if (!pool || pool.length > 100 || !CHAINS.has(chain)) return NextResponse.json({ error: "pool and chain required" }, { status: 400 });
  const key = `${chain}:${pool}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return NextResponse.json(hit.body);
  const body = await priceHistory(chain as Chain, pool);
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
