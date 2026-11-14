// Chain reads that don't die with one provider. Every chain has a list: the project owner's own key, our Alchemy key,
// then public endpoints. A provider that answers "over your limit" (Alchemy's monthly cap, a 429, a 401) is skipped
// for a while and the next one answers, so a spent key never turns a wallet's balance into 0.

import { rpcsFor } from "@/lib/chain";
import type { Chain } from "@/lib/spec";

/** Alchemy's network name per EVM chain id (hex), for the chains it serves. */
const ALCHEMY_BY_ID: Record<string, string> = {
  "0x1": "eth-mainnet", "0x2105": "base-mainnet", "0xa4b1": "arb-mainnet", "0xa": "opt-mainnet", "0x89": "polygon-mainnet",
  "0xa86a": "avax-mainnet", "0x138de": "berachain-mainnet", "0x82750": "scroll-mainnet", "0x38": "bnb-mainnet",
};

/** Public endpoints per EVM chain id (hex), tried in order after the keyed ones. */
const PUBLIC_BY_ID: Record<string, string[]> = {
  "0x1": ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://1rpc.io/eth", "https://eth.drpc.org"],
  "0x2105": ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://base.llamarpc.com", "https://1rpc.io/base"],
  "0xa4b1": ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc", "https://1rpc.io/arb"],
  "0xa": ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io", "https://1rpc.io/op"],
  "0x89": ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com", "https://1rpc.io/matic"],
  "0xa86a": ["https://avalanche-c-chain-rpc.publicnode.com", "https://api.avax.network/ext/bc/C/rpc", "https://1rpc.io/avax/c"],
  "0x138de": ["https://rpc.berachain.com", "https://berachain-rpc.publicnode.com"],
  "0x8f": ["https://rpc.monad.xyz"],
  "0x1237": ["https://rpc.mainnet.chain.robinhood.com"],
  "0x82750": ["https://rpc.scroll.io", "https://scroll-rpc.publicnode.com", "https://1rpc.io/scroll"],
  "0xc4": ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"],
  "0x2611": ["https://rpc.plasma.to"],
  "0x38": ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org", "https://1rpc.io/bnb"],
};

const CHAIN_ID: Partial<Record<Chain, string>> = { ethereum: "0x1", base: "0x2105", bsc: "0x38", robinhood: "0x1237" };
const PUBLIC_OTHER: Partial<Record<Chain, string[]>> = {
  solana: ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"],
  near: ["https://free.rpc.fastnear.com", "https://rpc.mainnet.near.org"],
};

// Providers that said "no more" recently, keyed by URL, with when to try them again.
const g = globalThis as unknown as { __devitRpcCool?: Map<string, number> };
const cool = (g.__devitRpcCool ??= new Map<string, number>());
const COOL_MS = 10 * 60_000;
const coolingNow = (url: string) => (cool.get(url) ?? 0) > Date.now();
const host = (url: string) => { try { return new URL(url).host; } catch { return "rpc"; } };

const uniq = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];

/** Every endpoint for an EVM chain id, best first; ones over their limit go last. */
export function evmUrls(chainId: string, extra?: string): string[] {
  const chain = (Object.entries(CHAIN_ID).find(([, id]) => id === chainId)?.[0] ?? null) as Chain | null;
  const net = ALCHEMY_BY_ID[chainId];
  const key = process.env.ALCHEMY_API_KEY;
  const list = uniq([...(chain ? rpcsFor(chain) : []), net && key ? `https://${net}.g.alchemy.com/v2/${encodeURIComponent(key)}` : null, extra, ...(PUBLIC_BY_ID[chainId] ?? [])]);
  return [...list.filter((u) => !coolingNow(u)), ...list.filter(coolingNow)];
}

/** Every endpoint for one of the site chains (near, solana, ethereum, base, bsc, robinhood), best first. */
export function chainUrls(chain: Chain): string[] {
  const id = CHAIN_ID[chain];
  if (id) return evmUrls(id);
  const list = uniq([...rpcsFor(chain), ...(PUBLIC_OTHER[chain] ?? [])]);
  return [...list.filter((u) => !coolingNow(u)), ...list.filter(coolingNow)];
}

/**
 * A failure that another provider won't fix: the call itself is wrong (a revert, a bad param, a NEAR account or key
 * that doesn't exist). Anything else (over a limit, network not enabled on that key, a server fault) tries the next one.
 */
const callError = (e: { code?: number; message?: string }) => {
  const t = JSON.stringify(e);
  return /revert|out of gas|invalid (argument|param)|HANDLER_ERROR|UNKNOWN_(ACCOUNT|ACCESS_KEY|TOKEN)|does not exist/i.test(t)
    && !/limit|capacity|exceeded|too many|not enabled|unauthori[sz]ed|forbidden|api key|quota/i.test(t);
};

/**
 * One JSON-RPC call, tried on each endpoint in turn until one answers. Returns the result, or undefined when none
 * could (callers show "couldn't read", never a made-up 0).
 */
export async function rpcCall<T>(urls: string[], method: string, params: unknown, timeoutMs = 5000): Promise<T | undefined> {
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      const j = (await r.json().catch(() => null)) as { result?: T; error?: { code?: number; message?: string } } | null;
      if (j && j.result !== undefined && !j.error) return j.result;
      if (j?.error && callError(j.error)) return undefined;
      if (!coolingNow(url)) console.warn(`[rpc] ${host(url)} ${method}: ${j?.error?.message?.slice(0, 120) ?? `HTTP ${r.status}`}; using the next provider for 10 min`);
      cool.set(url, Date.now() + COOL_MS);
    } catch {
      // Timeout or network: try the next one, but don't bench this one for long.
      cool.set(url, Date.now() + 30_000);
    }
  }
  return undefined;
}

/** Whether an endpoint is benched right now (so a caller that picks one URL can pick a working one). */
export const rpcCooling = coolingNow;
