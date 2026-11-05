import type { Chain } from "./spec";

// Relay (relay.link): cross-chain swaps signed in the buyer's own wallet. Pay with ETH, USDC or BNB from an EVM chain,
// and the site's token itself lands in the buyer's wallet on the site's chain (EVM or Solana), in one or two wallet
// confirmations and usually seconds. NEAR isn't a Relay chain; NEAR Intents covers it (and Bitcoin, and private buys).
// No key needed. RELAY_API_KEY (sent as x-api-key) lifts the rate limit and lets quotes carry our referrer and app fee.

const API = process.env.RELAY_API_URL || "https://api.relay.link";

/** Relay's chain ids for the site chains it can deliver to. */
export const RELAY_DEST: Partial<Record<Chain, number>> = { ethereum: 1, base: 8453, bsc: 56, robinhood: 4663, solana: 792703809 };

const NATIVE_EVM = "0x0000000000000000000000000000000000000000";
const NATIVE_SOL = "11111111111111111111111111111111";

/** What a buyer can pay with through Relay: EVM coins on the chains our wallet layer can switch to. */
export const RELAY_PAY = [
  { key: "eth:ETH", label: "ETH", chain: "Ethereum", walletChain: "ethereum" as Chain, chainId: 1, currency: NATIVE_EVM, decimals: 18 },
  { key: "base:ETH", label: "ETH", chain: "Base", walletChain: "base" as Chain, chainId: 8453, currency: NATIVE_EVM, decimals: 18 },
  { key: "base:USDC", label: "USDC", chain: "Base", walletChain: "base" as Chain, chainId: 8453, currency: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  { key: "eth:USDC", label: "USDC", chain: "Ethereum", walletChain: "ethereum" as Chain, chainId: 1, currency: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { key: "bsc:BNB", label: "BNB", chain: "BNB Chain", walletChain: "bsc" as Chain, chainId: 56, currency: NATIVE_EVM, decimals: 18 },
] as const;
export type RelayPayKey = (typeof RELAY_PAY)[number]["key"];

export interface RelayTx { to: string; data: string; value: string; chainId: number; gas: string | null }
export interface RelayQuote {
  requestId: string | null;
  amountIn: string;
  amountOut: string;
  amountOutUsd: string | null;
  symbol: string;
  impactPct: number | null;
  timeEstimate: number | null;
  feesUsd: number | null;
  /** The wallet transactions, in order (an approval first when paying with USDC). Only when `user` was given. */
  txs: RelayTx[];
  /** The pay chain the wallet has to be on. */
  walletChain: Chain;
}

const toUnits = (amount: number, decimals: number) => (BigInt(Math.round(amount * 1e6)) * 10n ** BigInt(decimals) / 1_000_000n).toString();
const headers = () => ({ "content-type": "application/json", ...(process.env.RELAY_API_KEY ? { "x-api-key": process.env.RELAY_API_KEY } : {}) });

// Stand-ins for a quote before a wallet is connected (Relay quotes need a sender and recipient). Never used to send.
const DRY_EVM = "0x000000000000000000000000000000000000dEaD";
const DRY_SOL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

export async function relayQuote(opts: { pay: RelayPayKey; amount: number; chain: Chain; token: string; user?: string; recipient?: string }): Promise<RelayQuote | { error: string }> {
  const pay = RELAY_PAY.find((p) => p.key === opts.pay);
  const dest = RELAY_DEST[opts.chain];
  if (!pay) return { error: "That coin isn't supported" };
  if (!dest) return { error: "Relay doesn't reach this chain. Use NEAR Intents." };
  const live = !!(opts.user && opts.recipient);
  const body: Record<string, unknown> = {
    user: opts.user || DRY_EVM,
    recipient: opts.recipient || (opts.chain === "solana" ? DRY_SOL : DRY_EVM),
    originChainId: pay.chainId,
    destinationChainId: dest,
    originCurrency: pay.currency,
    destinationCurrency: opts.token === "native" ? (opts.chain === "solana" ? NATIVE_SOL : NATIVE_EVM) : opts.token,
    tradeType: "EXACT_INPUT",
    amount: toUnits(opts.amount, pay.decimals),
  };
  // Relay only accepts a custom referrer (and app fees) from a keyed integrator.
  if (process.env.RELAY_API_KEY) {
    body.referrer = "sitesmith";
    const fee = Number(process.env.RELAY_FEE_BPS || 0);
    if (fee > 0 && process.env.RELAY_FEE_RECIPIENT) body.appFees = [{ recipient: process.env.RELAY_FEE_RECIPIENT, fee: String(fee) }];
  }
  try {
    const r = await fetch(`${API}/quote`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as RelayRaw;
    if (!r.ok || !j.steps) return { error: relayError(j) };
    const txs: RelayTx[] = [];
    for (const s of j.steps) {
      if (s.kind !== "transaction") return { error: "This route needs a signature Relay's wallet flow handles; use NEAR Intents for it." };
      for (const it of s.items ?? []) {
        const d = it.data;
        if (!d?.to) continue;
        txs.push({ to: d.to, data: d.data ?? "0x", value: d.value ?? "0", chainId: d.chainId ?? pay.chainId, gas: d.gas ?? null });
      }
    }
    const out = j.details?.currencyOut;
    const fees = Object.values(j.fees ?? {}).reduce((a, f) => a + (Number(f?.amountUsd) || 0), 0);
    return {
      requestId: j.steps.find((s) => s.requestId)?.requestId ?? null,
      amountIn: String(opts.amount),
      amountOut: out?.amountFormatted ?? "?",
      amountOutUsd: out?.amountUsd ?? null,
      symbol: out?.currency?.symbol ?? "",
      impactPct: j.details?.totalImpact?.percent != null ? Number(j.details.totalImpact.percent) : null,
      timeEstimate: j.details?.timeEstimate ?? null,
      feesUsd: fees || null,
      txs: live ? txs : [],
      walletChain: pay.walletChain,
    };
  } catch {
    return { error: "Relay didn't answer in time" };
  }
}

interface RelayRaw {
  message?: string;
  errorCode?: string;
  steps?: Array<{ kind: string; requestId?: string; items?: Array<{ data?: { to?: string; data?: string; value?: string; chainId?: number; gas?: string } }> }>;
  fees?: Record<string, { amountUsd?: string } | undefined>;
  details?: { timeEstimate?: number; totalImpact?: { percent?: string }; currencyOut?: { amountFormatted?: string; amountUsd?: string; currency?: { symbol?: string } } };
}

function relayError(j: RelayRaw): string {
  const m = j.message ?? "";
  if (/too (low|small)|minimum/i.test(m) || j.errorCode === "AMOUNT_TOO_LOW") return "That amount is too small for this route. Try a bit more.";
  if (/no (swap )?routes?|unsupported|not supported|NO_SWAP_ROUTES_FOUND/i.test(m + (j.errorCode ?? ""))) return "Relay has no route to this token yet. Try NEAR Intents.";
  if (/insufficient/i.test(m)) return "Not enough balance in that wallet for this amount.";
  return m || "No quote from Relay right now";
}

/** Where a Relay request is: waiting → pending → success, or failure / refund. */
export async function relayStatus(requestId: string): Promise<string | null> {
  try {
    const r = await fetch(`${API}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`, { headers: headers(), signal: AbortSignal.timeout(8000), cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { status?: string };
    return j.status ?? null;
  } catch {
    return null;
  }
}
