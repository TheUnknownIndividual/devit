import type { Chain } from "./spec";

/** Guess the chain family from an address. EVM addresses can be Ethereum or Robinhood Chain. */
export function detectAddress(raw: string): { address: string; chains: Chain[] } | null {
  const s = raw.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return { address: s, chains: ["ethereum", "robinhood"] };
  if (/^[a-z0-9_\-.]{2,64}\.(near|tg)$/.test(s) || /^[0-9a-f]{64}$/.test(s)) return { address: s, chains: ["near"] };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return { address: s, chains: ["solana"] };
  return null;
}

/** Pull a contract address or DexScreener link out of free text. */
export function findAddress(text: string): string | null {
  const ds = text.match(/dexscreener\.com\/[a-z]+\/([A-Za-z0-9.\-_]+)/);
  if (ds) return ds[1];
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
