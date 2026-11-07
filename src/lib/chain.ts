import type { Chain, TokenInfo, TokenLink, TokenVenue } from "./spec";
import { detectAddress } from "./address";
import { ownerKeys } from "./keyscope";
import { b58decode, b58encode, findPda } from "./solana";
import { readVenue, venue } from "./venues";
export { detectAddress, findAddress } from "./address";

// Reads everything a token site needs from public sources: DexScreener for the pair, logo and socials (GeckoTerminal
// when DexScreener has no pair yet), the chain itself for name/symbol/supply, Blockscout/Helius for holders where we
// can, and the launchpad's own contracts for bonding-curve progress (lib/venues.ts says which venue it is).

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

// Alchemy's network names for the EVM chains we read. With ALCHEMY_API_KEY set (or a project owner's own Alchemy key)
// EVM reads go through Alchemy, and token logos fall back to alchemy_getTokenMetadata when DexScreener has none.
// Robinhood Chain stays on its own RPC.
const ALCHEMY_NET: Partial<Record<Chain, string>> = { ethereum: "eth-mainnet", base: "base-mainnet", bsc: "bnb-mainnet" };
export function alchemyUrl(chain: Chain, key: string | undefined): string | null {
  const net = ALCHEMY_NET[chain];
  return net && key ? `https://${net}.g.alchemy.com/v2/${encodeURIComponent(key)}` : null;
}
const isAlchemy = (url: string) => /\.g\.alchemy\.com\//.test(url);

export const DEFAULT_RPC: Record<Chain, string> = {
  near: process.env.NEAR_RPC_URL || "https://free.rpc.fastnear.com",
  solana: process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  ethereum: process.env.ETHEREUM_RPC_URL || alchemyUrl("ethereum", process.env.ALCHEMY_API_KEY) || "https://ethereum-rpc.publicnode.com",
  base: process.env.BASE_RPC_URL || alchemyUrl("base", process.env.ALCHEMY_API_KEY) || "https://base-rpc.publicnode.com",
  bsc: process.env.BSC_RPC_URL || alchemyUrl("bsc", process.env.ALCHEMY_API_KEY) || "https://bsc-rpc.publicnode.com",
  robinhood: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
};

/** The RPC for a read: the project owner's own (Settings → API keys) when set, else ours. */
export function rpcFor(chain: Chain): string {
  const k = ownerKeys();
  if (k.rpc?.[chain]) return k.rpc[chain]!;
  if (chain === "solana" && k.helius) return `https://mainnet.helius-rpc.com/?api-key=${k.helius}`;
  return alchemyUrl(chain, k.alchemy) ?? DEFAULT_RPC[chain];
}

const isHelius = (url: string) => /\.helius-rpc\.com\//.test(url);

export const BLOCKSCOUT: Partial<Record<Chain, string>> = {
  ethereum: "https://eth.blockscout.com", base: "https://base.blockscout.com", robinhood: "https://robinhoodchain.blockscout.com",
};

export const GECKO_NETWORK: Record<Chain, string> = { near: "near", solana: "solana", ethereum: "eth", base: "base", bsc: "bsc", robinhood: "robinhood" };

interface DsPair {
  chainId: string;
  dexId: string;
  labels?: string[];
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

/** Chains an EVM address has pairs on, most liquid first: one DexScreener call instead of one per chain. */
async function evmChainsOf(address: string): Promise<Chain[]> {
  const r = await getJson<{ pairs?: DsPair[] | null }>(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`);
  const liq = new Map<string, number>();
  for (const p of r?.pairs ?? []) liq.set(p.chainId, (liq.get(p.chainId) ?? 0) + (p.liquidity?.usd ?? 0));
  return ([...liq].sort((a, b) => b[1] - a[1]).map(([c]) => c) as Chain[]).filter((c) => c in DEFAULT_RPC);
}

async function dexPairs(chain: Chain, address: string): Promise<DsPair[]> {
  const pairs = await getJson<DsPair[]>(`https://api.dexscreener.com/tokens/v1/${chain}/${encodeURIComponent(address)}`);
  if (Array.isArray(pairs) && pairs.length) return pairs;
  // A pair address (from a DexScreener link) instead of a token address.
  const one = await getJson<{ pairs?: DsPair[] }>(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${encodeURIComponent(address)}`);
  return one?.pairs ?? [];
}

// When Alchemy refuses (over its monthly capacity, a network not enabled, an outage), reads drop to the public RPC
// for that network and Alchemy is skipped for ten minutes, so a dead key never costs a site its token data.
const PUBLIC_EVM: Record<string, string> = {
  "eth-mainnet": "https://ethereum-rpc.publicnode.com", "base-mainnet": "https://base-rpc.publicnode.com", "bnb-mainnet": "https://bsc-rpc.publicnode.com",
};
const alchemyDown = new Map<string, number>();

async function rpc<T>(url: string, method: string, params: unknown): Promise<T | null> {
  const net = url.match(/^https:\/\/([a-z0-9-]+)\.g\.alchemy\.com\//)?.[1];
  const own = method.startsWith("alchemy_");
  if (net && PUBLIC_EVM[net] && (alchemyDown.get(net) ?? 0) > Date.now()) return own ? null : rpc<T>(PUBLIC_EVM[net], method, params);
  const r = await getJson<{ result?: T; error?: unknown }>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (net && PUBLIC_EVM[net] && (!r || r.error || r.result === undefined)) {
    // A plain "no such token" answer from alchemy_getTokenMetadata isn't Alchemy being down.
    if (!own || !r) alchemyDown.set(net, Date.now() + 10 * 60_000);
    return own ? null : rpc<T>(PUBLIC_EVM[net], method, params);
  }
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
  const explorer = BLOCKSCOUT[chain];
  const bs = explorer ? await getJson<{ holders_count?: string; holders?: string; icon_url?: string }>(`${explorer}/api/v2/tokens/${address}`) : null;
  const holders = bs ? Number(bs.holders_count ?? bs.holders ?? NaN) : NaN;
  // Alchemy's token metadata carries a logo for most listed tokens; only asked when Blockscout had none.
  const meta = !bs?.icon_url && isAlchemy(rpcUrl) ? await rpc<{ logo?: string | null; name?: string | null; symbol?: string | null }>(rpcUrl, "alchemy_getTokenMetadata", [address]) : null;
  return { name: decodeAbiString(name) ?? meta?.name ?? null, symbol: decodeAbiString(symbol) ?? meta?.symbol ?? null, decimals: dec, supply: sup, holders: Number.isFinite(holders) ? holders : null, icon: bs?.icon_url ?? meta?.logo ?? null };
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

// ---------- launchpads ----------

interface GeckoToken { name: string | null; symbol: string | null; image: string | null; priceUsd: number | null; fdv: number | null; mcap: number | null; reserve: number | null; vol24: number | null; pool: string | null; dexId: string | null; progress: number | null; completed: boolean | null }

/** GeckoTerminal's token page: for tokens DexScreener hasn't listed (Pons curves, brand-new launches). */
async function geckoToken(chain: Chain, address: string): Promise<GeckoToken | null> {
  type Pool = { attributes: { address: string; reserve_in_usd?: string }; relationships?: { dex?: { data?: { id: string } } } };
  const r = await getJson<{ data?: { attributes: Record<string, unknown> & { launchpad_details?: { graduation_percentage?: number; completed?: boolean } | null } }; included?: Pool[] }>(
    `https://api.geckoterminal.com/api/v2/networks/${GECKO_NETWORK[chain]}/tokens/${encodeURIComponent(address)}?include=top_pools`,
    { headers: { accept: "application/json" } },
  );
  const a = r?.data?.attributes;
  if (!a) return null;
  const n = (k: string) => (a[k] != null && Number.isFinite(Number(a[k])) ? Number(a[k]) : null);
  const top = [...(r?.included ?? [])].sort((x, y) => Number(y.attributes.reserve_in_usd ?? 0) - Number(x.attributes.reserve_in_usd ?? 0))[0];
  const lp = a.launchpad_details;
  return {
    name: typeof a.name === "string" ? a.name : null, symbol: typeof a.symbol === "string" ? a.symbol : null, image: typeof a.image_url === "string" && a.image_url !== "missing.png" ? a.image_url : null,
    priceUsd: n("price_usd"), fdv: n("fdv_usd"), mcap: n("market_cap_usd"), reserve: n("total_reserve_in_usd"), vol24: Number((a.volume_usd as { h24?: string } | undefined)?.h24 ?? NaN) || null,
    pool: top?.attributes.address ?? null, dexId: top?.relationships?.dex?.data?.id ?? null,
    progress: typeof lp?.graduation_percentage === "number" ? Math.min(1, lp.graduation_percentage / 100) : null, completed: lp?.completed ?? null,
  };
}

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
// Tokens a pump.fun curve sells before it graduates (initial_real_token_reserves in its Global account, read 2026-11-04).
const PUMP_CURVE_TOKENS = 793_100_000_000_000n;

/** A pump.fun coin's bonding curve on chain: how much of it is sold, and whether it has graduated. */
async function pumpCurve(mint: string, rpcUrl: string): Promise<{ progress: number; complete: boolean } | null> {
  let pda: string;
  try {
    const p = findPda([new TextEncoder().encode("bonding-curve"), b58decode(mint)], b58decode(PUMP_PROGRAM));
    if (!p) return null;
    pda = b58encode(p);
  } catch { return null; }
  const acc = await rpc<{ value?: { data?: [string, string] } | null }>(rpcUrl, "getAccountInfo", [pda, { encoding: "base64" }]);
  const b64 = acc?.value?.data?.[0];
  if (!b64) return null;
  const b = Buffer.from(b64, "base64");
  if (b.length < 49) return null;
  // 8-byte discriminator, then virtual token, virtual quote, real token, real quote reserves, supply (u64 each), complete.
  const realTokens = b.readBigUInt64LE(24);
  const complete = b[48] === 1;
  return { complete, progress: complete ? 1 : Math.max(0, Math.min(1, 1 - Number(realTokens) / Number(PUMP_CURVE_TOKENS))) };
}

const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

/** A PonsV2 token's curve on Robinhood Chain: its factory record, then the curve's raised quote against its target. */
async function ponsCurve(token: string, rpcUrl: string): Promise<{ curve: string; progress: number; graduated: boolean } | null> {
  const call = (to: string, data: string) => rpc<string>(rpcUrl, "eth_call", [{ to, data }, "latest"]);
  // getLaunchedToken(address): a static struct, so the token is word 0 and its curve word 1.
  const rec = await call(PONS_FACTORY, `0x3cf28b5a${token.slice(2).toLowerCase().padStart(64, "0")}`);
  if (!rec || rec.length < 130 || `0x${rec.slice(26, 66)}`.toLowerCase() !== token.toLowerCase()) return null;
  const curve = `0x${rec.slice(90, 130)}`;
  const [raised, target, grad] = await Promise.all([call(curve, "0x4f1f58fd"), call(curve, "0x8b0bc501"), call(curve, "0xe7c2b772")]);
  const big = (h: string | null) => (h && h !== "0x" ? BigInt(h) : 0n);
  const graduated = big(grad) === 1n;
  const t = big(target);
  return { curve, graduated, progress: graduated ? 1 : t > 0n ? Math.min(1, Number((big(raised) * 10_000n) / t) / 10_000) : 0 };
}

/** The token's launchpad and pool, with curve progress read from the launchpad itself where it's cheap. */
async function venueOf(chain: Chain, address: string, pairs: DsPair[], gecko: GeckoToken | null, rpcUrl: string): Promise<TokenVenue | null> {
  const like = pairs.map((p) => ({ dexId: p.dexId, labels: p.labels, liquidity: p.liquidity }));
  if (gecko?.dexId) like.push({ dexId: gecko.dexId, labels: [], liquidity: { usd: gecko.reserve ?? 0 } });
  let tv = readVenue(chain, address, like);
  if (chain === "robinhood" && /^0x[0-9a-fA-F]{40}$/.test(address) && (!tv || tv.launchpad === "pons" || !tv.launchpad)) {
    const c = await ponsCurve(address, rpcUrl);
    if (c) {
      const graduated = c.graduated || (tv?.dex != null && tv.launchpad !== "pons");
      tv = { launchpad: "pons", dex: graduated ? tv?.dex ?? "uniswap" : null, stage: graduated ? "graduated" : "curve", progress: c.progress, buyUrl: venue("pons")!.buy!(address, chain) };
    }
  }
  if (tv?.launchpad === "pumpfun") {
    const c = await pumpCurve(address, rpcUrl);
    if (c) tv = { ...tv, progress: c.progress, stage: c.complete ? "graduated" : "curve", dex: c.complete ? tv.dex ?? "pumpswap" : null };
  }
  if (tv?.stage === "curve" && tv.progress == null && gecko?.progress != null) tv = { ...tv, progress: gecko.progress };
  return tv;
}

function linksFrom(pair: DsPair | undefined): TokenLink[] {
  const out: TokenLink[] = [];
  for (const w of pair?.info?.websites ?? []) out.push({ type: "website", label: w.label || "Website", url: w.url });
  for (const s of pair?.info?.socials ?? []) {
    // DexScreener files Farcaster profiles under whatever type the team picked; the host says what it is.
    const type = /^https?:\/\/(www\.)?(warpcast\.com|farcaster\.xyz)\//i.test(s.url) ? "farcaster" : s.type;
    out.push({ type, label: type === "twitter" ? "X" : type[0].toUpperCase() + type.slice(1), url: s.url });
  }
  return out;
}

/** Everything we can learn about a token. Tries each candidate chain until DexScreener or the chain answers. */
export async function tokenContext(raw: string, preferred?: Chain, rpcOverride?: string): Promise<TokenInfo | null> {
  const det = detectAddress(raw);
  if (!det) return null;
  let order = preferred && det.chains.includes(preferred) ? [preferred, ...det.chains.filter((c) => c !== preferred)] : det.chains;
  // An EVM address could be on any of four chains: ask DexScreener once which ones it trades on.
  if (order.length > 1 && /^0x[0-9a-fA-F]{40}$/.test(det.address)) {
    const where = (await evmChainsOf(det.address)).filter((c) => order.includes(c));
    if (where.length) order = [...where, ...order.filter((c) => !where.includes(c))];
  }

  for (const chain of order) {
    // A user's own RPC is for the chain the project is on; other candidates read from their public RPC.
    const rpcUrl = (chain === preferred && rpcOverride) || rpcFor(chain);
    const all = await dexPairs(chain, det.address);
    const best = [...all].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const tokenAddr = best ? best.baseToken.address : det.address;
    // A pair link resolves to its base token; every pair of that token says where it trades.
    const pairs = best && tokenAddr.toLowerCase() !== det.address.toLowerCase() ? await dexPairs(chain, tokenAddr) : all;
    const sources: string[] = [];
    if (best) sources.push("DexScreener");

    let basics: { name: string | null; symbol: string | null; decimals: number | null; supply: number | null; icon?: string | null; holders?: number | null } | null = null;
    if (chain === "near") basics = await nearBasics(tokenAddr, rpcUrl);
    else if (chain === "solana") basics = await solanaBasics(tokenAddr, rpcUrl);
    else basics = await evmBasics(chain, tokenAddr, rpcUrl);
    if (basics && (basics.name || basics.symbol || basics.supply != null)) sources.push(chain === "solana" && isHelius(rpcUrl) ? "Helius" : isAlchemy(rpcUrl) ? "Alchemy" : `${chain} RPC`);

    if (!best && !basics?.name && !basics?.symbol) continue;
    // Not on DexScreener yet (a fresh launch, or a curve it doesn't index): GeckoTerminal has the curve's price.
    const gecko = !best && /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(tokenAddr) ? await geckoToken(chain, tokenAddr) : null;
    if (gecko && (gecko.priceUsd != null || gecko.pool)) sources.push("GeckoTerminal");
    const tv = await venueOf(chain, tokenAddr, pairs, gecko, rpcUrl).catch(() => null);
    if (tv?.progress != null && (tv.launchpad === "pumpfun" || tv.launchpad === "pons")) sources.push(`${venue(tv.launchpad)!.name} curve`);
    return {
      chain,
      address: tokenAddr,
      name: best?.baseToken.name || basics?.name || "Token",
      symbol: (best?.baseToken.symbol || basics?.symbol || "TOKEN").replace(/^\$/, ""),
      decimals: basics?.decimals ?? null,
      logo: best?.info?.imageUrl || basics?.icon || gecko?.image || null,
      header: best?.info?.header || null,
      description: null,
      links: linksFrom(best),
      priceUsd: best?.priceUsd ? Number(best.priceUsd) : gecko?.priceUsd ?? null,
      marketCap: best?.marketCap ?? best?.fdv ?? gecko?.mcap ?? gecko?.fdv ?? null,
      liquidityUsd: best?.liquidity?.usd ?? gecko?.reserve ?? null,
      volume24h: best?.volume?.h24 ?? gecko?.vol24 ?? null,
      change24h: best?.priceChange?.h24 ?? null,
      holders: basics?.holders ?? null,
      supply: basics?.supply ?? null,
      pairAddress: best?.pairAddress ?? gecko?.pool ?? null,
      pairUrl: best?.url ?? null,
      dexId: best?.dexId ?? gecko?.dexId ?? null,
      sources,
      ...(tv ? { venue: tv } : {}),
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

export interface PriceHistory { h1: number | null; h24: number | null; d7: number | null; launch: number | null }

/** The pool's price an hour, a day and a week ago, and at its first candle, from GeckoTerminal candles (USD). */
export async function priceHistory(chain: Chain, pool: string): Promise<PriceHistory> {
  type R = { data?: { attributes?: { ohlcv_list?: number[][] } } };
  const base = `https://api.geckoterminal.com/api/v2/networks/${GECKO_NETWORK[chain]}/pools/${encodeURIComponent(pool)}/ohlcv`;
  const list = async (unit: string, aggregate: number, limit: number) => {
    const r = await getJson<R>(`${base}/${unit}?aggregate=${aggregate}&limit=${limit}&currency=usd`, { headers: { accept: "application/json" } });
    return (r?.data?.attributes?.ohlcv_list ?? []).filter((c) => c.length >= 5 && c[4] > 0);
  };
  // The candle closest to a moment, only if it is within one bucket of it.
  const near = (cs: number[][], secsAgo: number, bucket: number): number | null => {
    const want = Date.now() / 1000 - secsAgo;
    let best: number[] | null = null;
    for (const c of cs) if (!best || Math.abs(c[0] - want) < Math.abs(best[0] - want)) best = c;
    return best && Math.abs(best[0] - want) <= bucket ? best[4] : null;
  };
  const [min, hour, four, day] = await Promise.all([list("minute", 1, 80), list("hour", 1, 30), list("hour", 4, 60), list("day", 1, 1000)]);
  const first = day.reduce<number[] | null>((a, c) => (!a || c[0] < a[0] ? c : a), null);
  return { h1: near(min, 3600, 180), h24: near(hour, 86400, 5400), d7: near(four, 7 * 86400, 14400), launch: first ? first[1] || first[4] : null };
}
