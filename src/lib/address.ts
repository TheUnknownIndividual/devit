import type { Chain } from "./spec";

const EVM: Chain[] = ["ethereum", "base", "bsc", "robinhood"];

/** Guess the chain family from an address. EVM addresses can be on any EVM chain we support. */
export function detectAddress(raw: string): { address: string; chains: Chain[] } | null {
  const s = raw.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return { address: s, chains: EVM };
  // A Uniswap v4 pool id (DexScreener and GeckoTerminal links use them): resolved to its token through DexScreener.
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return { address: s, chains: EVM };
  if (/^[a-z0-9_\-.]{2,64}\.(near|tg)$/.test(s) || /^[0-9a-f]{64}$/.test(s)) return { address: s, chains: ["near"] };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return { address: s, chains: ["solana"] };
  return null;
}

// Quote coins a swap link names next to the token: never the token itself.
const QUOTES = new Set([
  "So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "wrap.near", "usdt.tether-token.near", "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7", "0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0xbb4cdb9cbd36b01bd1cbaef60af27b2a8a9a6aa8", "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", "0x55d398326f99059ff775485246999027b3197955",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
].map((a) => a.toLowerCase()));

const isToken = (s: string) => !!detectAddress(s) && !QUOTES.has(s.toLowerCase());

// Query keys swap and launchpad links put the bought token under, most specific first.
const TOKEN_KEYS = ["outputCurrency", "outputMint", "outputToken", "tokenOut", "buy", "to", "token1", "output", "mint", "address", "token", "ca"];

/** The token (or pool) a link points at: a named query key first, else the first address in its path. */
export function addressInUrl(u: URL): string | null {
  for (const k of TOKEN_KEYS) {
    const v = u.searchParams.get(k);
    if (v && isToken(v)) return v;
  }
  for (const bit of `${u.pathname}#${u.hash}`.split(/[/#?&=:]+/)) {
    const b = decodeURIComponent(bit);
    if (isToken(b)) return b;
    // "SOL-<mint>" (Jupiter), "eth-to-0x…" (KyberSwap): a pair written as one segment.
    const part = b.split("-").find(isToken);
    if (part) return part;
  }
  for (const [, v] of u.searchParams) if (isToken(v)) return v;
  return null;
}

/** Links in free text, as URLs (bare hosts like pump.fun/coin/… too). */
export function urlsIn(text: string): URL[] {
  const out: URL[] = [];
  for (const m of text.matchAll(/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*)?/gi)) {
    if (!m[0].includes("/") || /^[a-z0-9_\-.]+\.(near|tg)$/i.test(m[0])) continue;
    try { out.push(new URL(/^https?:\/\//i.test(m[0]) ? m[0] : `https://${m[0]}`)); } catch { /* not a link */ }
  }
  return out;
}

/** Pull a contract address out of free text: from a venue, explorer or chart link first, else a bare address. */
export function findAddress(text: string): string | null {
  for (const u of urlsIn(text)) {
    if (/\/(tx|txs|txns|transaction)\//i.test(u.pathname)) continue;
    const a = addressInUrl(u);
    if (a) return a;
  }
  for (const word of text.split(/[\s,;()]+/)) {
    const w = word.replace(/[.,!?]+$/, "");
    if (detectAddress(w)) {
      // Plain words like "frog.near" count only when they look like a token account.
      if (/\.(near|tg)$/.test(w) && !/[0-9_\-.]/.test(w.replace(/\.(near|tg)$/, "")) && w.length < 8) continue;
      return w;
    }
  }
  return null;
}
