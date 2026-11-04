import { NextResponse } from "next/server";
import { tokenContext } from "@/lib/chain";
import { findLinks, research } from "@/lib/research";
import { CHAIN_IDS, type Chain } from "@/lib/spec";

const CHAINS = new Set<string>(CHAIN_IDS);
const cache = new Map<string, { at: number; body: unknown }>();

/** What we can find about a token before building: the landing page shows it as you paste. ?deep=1 adds the website and X. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = (u.searchParams.get("address") ?? "").trim().slice(0, 120);
  const chain = u.searchParams.get("chain") ?? "";
  const deep = u.searchParams.get("deep") === "1";
  const given = { x: u.searchParams.get("x") ?? undefined, telegram: u.searchParams.get("telegram") ?? undefined, website: u.searchParams.get("website") ?? undefined };
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });
  const key = JSON.stringify([address, chain, deep, given]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json(hit.body);
  const token = await tokenContext(address, CHAINS.has(chain) ? (chain as Chain) : undefined);
  if (!token) return NextResponse.json({ error: "Couldn't find that token on NEAR, Solana, Ethereum, Base, BNB Chain or Robinhood Chain." }, { status: 404 });
  const found = deep ? await research(token, given) : await findLinks(token, given);
  const body = { token, ...found };
  cache.set(key, { at: Date.now(), body });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return NextResponse.json(body);
}
