import { NextResponse } from "next/server";
import { DEFAULT_RPC } from "@/lib/chain";
import { CHAINS, type Chain } from "@/lib/spec";

// The connected visitor's native balance, for the wallet chip on a generated site. Read on the server so the site
// needs no RPC of its own (and the Helius key stays here). Cached briefly so a chip that re-renders doesn't hammer it.

const cache = new Map<string, { at: number; body: { amount: number; symbol: string } }>();
const VALID: Record<Chain, RegExp> = {
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  robinhood: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  near: /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/,
};

async function rpc<T>(url: string, method: string, params: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  const j = (await r.json()) as { result?: T; error?: { message?: string } };
  if (j.error || j.result === undefined) throw new Error(j.error?.message || "no result");
  return j.result;
}

// Public endpoints to fall back on when the configured RPC is down or out of credit.
const FALLBACK: Record<Chain, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  robinhood: "https://robinhood-rpc.publicnode.com",
  solana: "https://api.mainnet-beta.solana.com",
  near: "https://free.rpc.fastnear.com",
};

async function read(chain: Chain, address: string): Promise<number> {
  try { return await readFrom(DEFAULT_RPC[chain], chain, address); } catch (e) {
    if (DEFAULT_RPC[chain] === FALLBACK[chain]) throw e;
    return readFrom(FALLBACK[chain], chain, address);
  }
}

async function readFrom(url: string, chain: Chain, address: string): Promise<number> {
  if (chain === "solana") return (await rpc<{ value: number }>(url, "getBalance", [address, { commitment: "confirmed" }])).value / 1e9;
  if (chain === "near") {
    const r = await rpc<{ amount: string }>(url, "query", { request_type: "view_account", finality: "final", account_id: address });
    return Number(BigInt(r.amount) / 10n ** 18n) / 1e6;
  }
  return Number(BigInt(await rpc<string>(url, "eth_getBalance", [address, "latest"])) / 10n ** 12n) / 1e6;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = (u.searchParams.get("chain") ?? "") as Chain;
  const address = u.searchParams.get("address") ?? "";
  if (!(chain in CHAINS) || !VALID[chain].test(address)) return NextResponse.json({ error: "chain and address required" }, { status: 400 });
  const key = `${chain}:${address.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10_000) return NextResponse.json(hit.body);
  try {
    const body = { amount: await read(chain, address), symbol: CHAINS[chain].native };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 5000) for (const [k, v] of cache) if (Date.now() - v.at > 60_000) cache.delete(k);
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "No balance right now" }, { status: 502 });
  }
}
