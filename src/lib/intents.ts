import type { Chain } from "./spec";

// NEAR Intents 1-Click: pay from any chain. The buyer sends to a quote-specific deposit address and
// receives the destination asset on the site's chain. If the token itself is listed on 1-Click we deliver
// it directly; otherwise we deliver the chain's native coin and the site's buy box swaps it.

const ONECLICK = process.env.ONECLICK_URL || "https://1click.chaindefuser.com";

export interface OneClickToken { assetId: string; decimals: number; blockchain: string; symbol: string; price: number; contractAddress?: string }

let cache: { at: number; list: OneClickToken[] } | null = null;

export async function oneClickTokens(): Promise<OneClickToken[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.list;
  const r = await fetch(`${ONECLICK}/v0/tokens`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) return cache?.list ?? [];
  const list = (await r.json()) as OneClickToken[];
  cache = { at: Date.now(), list };
  return list;
}

const CHAIN_KEY: Record<Chain, string> = { near: "near", solana: "sol", ethereum: "eth", base: "base", bsc: "bsc", robinhood: "hood" };
const NATIVE: Record<Chain, string> = { near: "wNEAR", solana: "SOL", ethereum: "ETH", base: "ETH", bsc: "BNB", robinhood: "ETH" };

/** Coins a buyer can pay with, shown in the "Any chain" picker. */
export const PAY_WITH = [
  { key: "sol:SOL", label: "SOL", chain: "Solana" },
  { key: "eth:ETH", label: "ETH", chain: "Ethereum" },
  { key: "btc:BTC", label: "BTC", chain: "Bitcoin" },
  { key: "base:USDC", label: "USDC", chain: "Base" },
  { key: "sol:USDC", label: "USDC", chain: "Solana" },
  { key: "eth:USDT", label: "USDT", chain: "Ethereum" },
  { key: "near:wNEAR", label: "NEAR", chain: "NEAR" },
] as const;

/**
 * Private buys: 1-Click's Confidential Intents ("confidentiality" on the quote) hide the link between the paying and the
 * receiving address. 1-Click only quotes them for a partner key, so they're offered when ONECLICK_JWT is set.
 * ONECLICK_PRIVATE_LEVEL=basic switches from the default "advanced".
 */
export const privateOn = () => !!process.env.ONECLICK_JWT;
const privateLevel = () => (process.env.ONECLICK_PRIVATE_LEVEL === "basic" ? "basic" : "advanced");

export async function destinationFor(chain: Chain, tokenAddress: string | null): Promise<{ asset: OneClickToken; direct: boolean } | null> {
  const list = await oneClickTokens();
  const key = CHAIN_KEY[chain];
  if (tokenAddress) {
    const t = list.find((x) => x.blockchain === key && (x.contractAddress?.toLowerCase() === tokenAddress.toLowerCase() || x.assetId === `nep141:${tokenAddress}`));
    if (t) return { asset: t, direct: true };
  }
  const native = list.find((x) => x.blockchain === key && x.symbol === NATIVE[chain] && !x.contractAddress) ?? list.find((x) => x.blockchain === key && x.symbol === NATIVE[chain]);
  return native ? { asset: native, direct: false } : null;
}

export interface IntentQuote {
  depositAddress: string | null;
  amountIn: string;
  amountOut: string;
  amountOutUsd: string | null;
  timeEstimate: number | null;
  deliver: { symbol: string; direct: boolean };
  dry: boolean;
  private: boolean;
}

export async function intentQuote(opts: { pay: string; amount: number; chain: Chain; token: string | null; recipient: string; refundTo: string; dry: boolean; private?: boolean }): Promise<IntentQuote | { error: string }> {
  const list = await oneClickTokens();
  const [bc, sym] = opts.pay.split(":");
  const origin = list.find((x) => x.blockchain === bc && x.symbol === sym);
  if (!origin) return { error: "That coin isn't supported" };
  const dest = await destinationFor(opts.chain, opts.token);
  if (!dest) return { error: "This chain isn't reachable through NEAR Intents yet" };
  const amount = BigInt(Math.round(opts.amount * 10 ** Math.min(origin.decimals, 12))) * 10n ** BigInt(Math.max(0, origin.decimals - 12));
  const body: Record<string, unknown> = {
    dry: opts.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: origin.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: dest.asset.assetId,
    amount: amount.toString(),
    refundTo: opts.refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: opts.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
    referral: "sitesmith",
  };
  if (opts.private) {
    if (!privateOn()) return { error: "Private buys aren't set up on this server." };
    body.confidentiality = privateLevel();
  }
  const fee = Number(process.env.ONECLICK_FEE_BPS || 0);
  if (fee > 0 && process.env.ONECLICK_FEE_RECIPIENT) body.appFees = [{ recipient: process.env.ONECLICK_FEE_RECIPIENT, fee }];
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  try {
    const r = await fetch(`${ONECLICK}/v0/quote`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
    const j = (await r.json()) as { message?: string; quote?: { depositAddress?: string; amountInFormatted?: string; amountOutFormatted?: string; amountOutUsd?: string; timeEstimate?: number } };
    if (!r.ok || !j.quote) return { error: /too low/i.test(j.message ?? "") ? "That amount is too small for this route. Try a bit more." : j.message || "No quote right now" };
    return {
      depositAddress: j.quote.depositAddress ?? null,
      amountIn: j.quote.amountInFormatted ?? String(opts.amount),
      amountOut: j.quote.amountOutFormatted ?? "?",
      amountOutUsd: j.quote.amountOutUsd ?? null,
      timeEstimate: j.quote.timeEstimate ?? null,
      deliver: { symbol: dest.asset.symbol, direct: dest.direct },
      dry: opts.dry,
      private: !!opts.private,
    };
  } catch {
    return { error: "NEAR Intents didn't answer in time" };
  }
}
