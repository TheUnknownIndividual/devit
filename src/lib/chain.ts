import type { Chain, TokenInfo, TokenLink } from "./spec";
import { detectAddress } from "./address";
import { ownerKeys } from "./keyscope";
export { detectAddress, findAddress } from "./address";

// Reads everything a token site needs from public sources: DexScreener for the pair, logo and socials,
// the chain itself for name/symbol/supply, and Blockscout/Helius for holders where we can.

const TIMEOUT_MS = 6000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const DEFAULT_RPC: Record<Chain, string> = {
  near: process.env.NEAR_RPC_URL || "https://free.rpc.fastnear.com",
  solana: process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  ethereum: process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
  robinhood: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
};

/** The RPC for a read: the project owner's own (Settings → API keys) when set, else ours. */
export function rpcFor(chain: Chain): string {
  const k = ownerKeys();
  if (k.rpc?.[chain]) return k.rpc[chain]!;
  if (chain === "solana" && k.helius) return `https://mainnet.helius-rpc.com/?api-key=${k.helius}`;
  return DEFAULT_RPC[chain];
}

const isHelius = (url: string) => /\.helius-rpc\.com\//.test(url);

export const GECKO_NETWORK: Record<Chain, string> = { near: "near", solana: "solana", ethereum: "eth", robinhood: "robinhood" };

interface DsPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  info?: { imageUrl?: string; header?: string; websites?: { label?: string; url: string }[]; socials?: { type: string; url: string }[] };
}

async function dexPairs(chain: Chain, address: string): Promise<DsPair[]> {
  const pairs = await getJson<DsPair[]>(`https://api.dexscreener.com/tokens/v1/${chain}/${encodeURIComponent(address)}`);
  if (Array.isArray(pairs) && pairs.length) return pairs;
  // A pair address (from a DexScreener link) instead of a token address.
  const one = await getJson<{ pairs?: DsPair[] }>(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${encodeURIComponent(address)}`);
  return one?.pairs ?? [];
}

async function rpc<T>(url: string, method: string, params: unknown): Promise<T | null> {
  const r = await getJson<{ result?: T }>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r?.result ?? null;
}

function decodeAbiString(hex: string | null): string | null {
  if (!hex || hex === "0x") return null;
  const h = hex.slice(2);
  try {
    if (h.length >= 128) {
      const len = parseInt(h.slice(64, 128), 16);
      const bytes = h.slice(128, 128 + len * 2);
      return Buffer.from(bytes, "hex").toString("utf8").replace(/\0/g, "") || null;
    }
    return Buffer.from(h, "hex").toString("utf8").replace(/\0/g, "").trim() || null;
  } catch {
    return null;
  }
}

async function evmBasics(chain: Chain, address: string, rpcUrl: string) {
  const call = (data: string) => rpc<string>(rpcUrl, "eth_call", [{ to: address, data }, "latest"]);
  const [name, symbol, decimals, supply] = await Promise.all([call("0x06fdde03"), call("0x95d89b41"), call("0x313ce567"), call("0x18160ddd")]);
  const dec = decimals && decimals !== "0x" ? Number(BigInt(decimals)) : null;
  const sup = supply && supply !== "0x" && dec != null ? Number(BigInt(supply)) / 10 ** dec : null;
  const explorer = chain === "robinhood" ? "https://robinhoodchain.blockscout.com" : "https://eth.blockscout.com";
  const bs = await getJson<{ holders_count?: string; holders?: string; icon_url?: string }>(`${explorer}/api/v2/tokens/${address}`);
  const holders = bs ? Number(bs.holders_count ?? bs.holders ?? NaN) : NaN;
  return { name: decodeAbiString(name), symbol: decodeAbiString(symbol), decimals: dec, supply: sup, holders: Number.isFinite(holders) ? holders : null, icon: bs?.icon_url ?? null };
}

async function nearBasics(address: string, rpcUrl: string) {
  const view = async (method: string) => {
    const r = await rpc<{ result?: number[] }>(rpcUrl, "query", { request_type: "call_function", finality: "final", account_id: address, method_name: method, args_base64: "e30=" });
    if (!r?.result) return null;
    try { return JSON.parse(Buffer.from(r.result).toString("utf8")); } catch { return null; }
  };
  const [meta, supply] = await Promise.all([view("ft_metadata"), view("ft_total_supply")]);
  const dec = typeof meta?.decimals === "number" ? meta.decimals : null;
  const icon = typeof meta?.icon === "string" && meta.icon.length < 200_000 ? meta.icon : null;
  return {
    name: typeof meta?.name === "string" ? meta.name : null,
    symbol: typeof meta?.symbol === "string" ? meta.symbol : null,
    decimals: dec,
    supply: typeof supply === "string" && dec != null ? Number(BigInt(supply)) / 10 ** dec : null,
    icon,
  };
}

async function solanaBasics(address: string, rpcUrl: string) {
  const sup = await rpc<{ value?: { uiAmount?: number; decimals?: number } }>(rpcUrl, "getTokenSupply", [address]);
  let name: string | null = null, symbol: string | null = null, icon: string | null = null;
  const holders: number | null = null;
  if (isHelius(rpcUrl)) {
    const asset = await rpc<{ content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } } }>(rpcUrl, "getAsset", { id: address });
    name = asset?.content?.metadata?.name ?? null;
    symbol = asset?.content?.metadata?.symbol ?? null;
    icon = asset?.content?.links?.image ?? null;
    // No holder count here: getTokenAccounts' `total` is the size of the returned page, not the number of holders.
  }
  return { name, symbol, icon, holders, decimals: sup?.value?.decimals ?? null, supply: sup?.value?.uiAmount ?? null };
}

function linksFrom(pair: DsPair | undefined): TokenLink[] {
  const out: TokenLink[] = [];
  for (const w of pair?.info?.websites ?? []) out.push({ type: "website", label: w.label || "Website", url: w.url });
  for (const s of pair?.info?.socials ?? []) out.push({ type: s.type, label: s.type === "twitter" ? "X" : s.type[0].toUpperCase() + s.type.slice(1), url: s.url });
  return out;
}

/** Everything we can learn about a token. Tries each candidate chain until DexScreener or the chain answers. */
export async function tokenContext(raw: string, preferred?: Chain, rpcOverride?: string): Promise<TokenInfo | null> {
  const det = detectAddress(raw);
  if (!det) return null;
  const order = preferred && det.chains.includes(preferred) ? [preferred, ...det.chains.filter((c) => c !== preferred)] : det.chains;

  for (const chain of order) {
    const rpcUrl = rpcOverride || rpcFor(chain);
    const pairs = await dexPairs(chain, det.address);
    const best = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const tokenAddr = best ? best.baseToken.address : det.address;
    const sources: string[] = [];
    if (best) sources.push("DexScreener");

    let basics: { name: string | null; symbol: string | null; decimals: number | null; supply: number | null; icon?: string | null; holders?: number | null } | null = null;
    if (chain === "near") basics = await nearBasics(tokenAddr, rpcUrl);
    else if (chain === "solana") basics = await solanaBasics(tokenAddr, rpcUrl);
    else basics = await evmBasics(chain, tokenAddr, rpcUrl);
    if (basics && (basics.name || basics.symbol || basics.supply != null)) sources.push(chain === "solana" && isHelius(rpcUrl) ? "Helius" : `${chain} RPC`);

    if (!best && !basics?.name && !basics?.symbol) continue;
    return {
      chain,
      address: tokenAddr,
      name: best?.baseToken.name || basics?.name || "Token",
      symbol: (best?.baseToken.symbol || basics?.symbol || "TOKEN").replace(/^\$/, ""),
      decimals: basics?.decimals ?? null,
      logo: best?.info?.imageUrl || basics?.icon || null,
      header: best?.info?.header || null,
      description: null,
      links: linksFrom(best),
      priceUsd: best?.priceUsd ? Number(best.priceUsd) : null,
      marketCap: best?.marketCap ?? best?.fdv ?? null,
      liquidityUsd: best?.liquidity?.usd ?? null,
      volume24h: best?.volume?.h24 ?? null,
      change24h: best?.priceChange?.h24 ?? null,
      holders: basics?.holders ?? null,
      supply: basics?.supply ?? null,
      pairAddress: best?.pairAddress ?? null,
      pairUrl: best?.url ?? null,
      dexId: best?.dexId ?? null,
      sources,
    };
  }
  return null;
}

export interface Trade { side: "buy" | "sell"; usd: number; who: string; at: number }

/** Recent trades for a pool, from GeckoTerminal (free, covers all four chains). */
export async function recentTrades(chain: Chain, pool: string): Promise<Trade[]> {
  const r = await getJson<{ data?: { attributes: { kind: string; volume_in_usd: string; tx_from_address: string; block_timestamp: string } }[] }>(
    `https://api.geckoterminal.com/api/v2/networks/${GECKO_NETWORK[chain]}/pools/${encodeURIComponent(pool)}/trades`,
    { headers: { accept: "application/json" } },
  );
  return (r?.data ?? []).slice(0, 12).map((t) => ({
    side: t.attributes.kind === "sell" ? "sell" : "buy",
    usd: Number(t.attributes.volume_in_usd) || 0,
    who: t.attributes.tx_from_address,
    at: Date.parse(t.attributes.block_timestamp),
  }));
}
