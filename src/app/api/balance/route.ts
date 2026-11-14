import { NextResponse } from "next/server";
import { chainUrls, rpcCall } from "@/lib/rpc";
import { CHAINS, type Chain } from "@/lib/spec";

// The connected visitor's native balance, for the wallet chip on a generated site. Read on the server so the site
// needs no RPC of its own (and the Helius key stays here). Cached briefly so a chip that re-renders doesn't hammer it.

const cache = new Map<string, { at: number; body: { amount: number; symbol: string } }>();
const VALID: Record<Chain, RegExp> = {
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  base: /^0x[0-9a-fA-F]{40}$/,
  bsc: /^0x[0-9a-fA-F]{40}$/,
  robinhood: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  near: /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/,
};

// Every provider for the chain in turn (owner key, our Alchemy, public), skipping ones that are over their limit.
async function read(chain: Chain, address: string): Promise<number> {
  const urls = chainUrls(chain);
  const got = <T,>(method: string, params: unknown) => rpcCall<T>(urls, method, params, 6000).then((v) => { if (v === undefined) throw new Error("no result"); return v; });
  if (chain === "solana") return (await got<{ value: number }>("getBalance", [address, { commitment: "confirmed" }])).value / 1e9;
  if (chain === "near") {
    const r = await got<{ amount: string }>("query", { request_type: "view_account", finality: "final", account_id: address });
    return Number(BigInt(r.amount) / 10n ** 18n) / 1e6;
  }
  return Number(BigInt(await got<string>("eth_getBalance", [address, "latest"])) / 10n ** 12n) / 1e6;
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
    return NextResponse.json({ error: "No balance right now" }, { status: 422 });
  }
}
