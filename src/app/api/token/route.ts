import { NextResponse } from "next/server";
import { tokenContext } from "@/lib/chain";
import { CHAIN_IDS, type Chain } from "@/lib/spec";

const CHAINS = new Set<string>(CHAIN_IDS);

// Live figures for published sites and the builder. Cached briefly so a busy page doesn't hammer the sources.
const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = u.searchParams.get("address") ?? "";
  const chain = u.searchParams.get("chain") ?? "";
  if (!address || !CHAINS.has(chain)) return NextResponse.json({ error: "address and chain required" }, { status: 400 });
  const key = `${chain}:${address}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return NextResponse.json(hit.body);
  const t = await tokenContext(address, chain as Chain);
  const body = t ?? { error: "not found" };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, { status: t ? 200 : 404 });
}
