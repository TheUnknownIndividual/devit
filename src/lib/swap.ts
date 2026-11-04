import type { Chain } from "./spec";

// Same-chain buys inside a generated site, with the native coin as input.
// Solana routes through Jupiter, the EVM chains (Ethereum, Base, BNB Chain, Robinhood Chain) through KyberSwap, NEAR through neartrade's
// developer API (every launchpad curve and Rhea pool; its fee is inside the transactions it returns).
// The visitor's own wallet signs: the server only builds the unsigned transaction.
// A platform fee is charged only when the operator sets one in env (see .env.example).

const SOL_MINT = "So11111111111111111111111111111111111111112";
const NATIVE_EVM = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const JUP = "https://lite-api.jup.ag/swap/v1";
const KYBER = "https://aggregator-api.kyberswap.com";
const KYBER_CHAIN: Partial<Record<Chain, string>> = { ethereum: "ethereum", base: "base", bsc: "bsc", robinhood: "robinhood" };
const SLIPPAGE_BPS = 300;
const TIMEOUT = 9000;

export interface Quote { venue: string; out: number; impactPct: number | null; raw: unknown }
export interface NearTx { receiverId: string; actions: Array<{ type: string; params: Record<string, unknown> }> }
export type BuiltTx =
  | { kind: "solana"; tx: string; out: number; venue: string }
  | { kind: "near"; signerId: string; transactions: NearTx[]; out: number; minOut: number; venue: string }
  | { kind: "evm"; to: string; data: string; value: string; gas: string | null; out: number; venue: string };

export class SwapError extends Error {}

function feeBps(): number {
  const n = Number(process.env.SWAP_FEE_BPS ?? 0);
  return Number.isInteger(n) && n > 0 && n <= 200 ? n : 0;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) }).catch(() => {
    throw new SwapError("The router didn't answer in time.");
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!r.ok) throw new SwapError(j.error || j.message || "No route right now.");
  return j;
}

// ---------- Solana (Jupiter) ----------

function jupFee(): { bps: number; account: string } | null {
  const bps = feeBps();
  const account = process.env.JUP_FEE_ACCOUNT?.trim();
  return bps && account ? { bps, account } : null;
}

async function jupQuote(token: string, amount: number) {
  const lamports = Math.round(amount * 1e9);
  const fee = jupFee();
  const q = new URLSearchParams({ inputMint: SOL_MINT, outputMint: token, amount: String(lamports), slippageBps: String(SLIPPAGE_BPS) });
  if (fee) q.set("platformFeeBps", String(fee.bps));
  const j = await json<{ outAmount?: string; priceImpactPct?: string; routePlan?: { swapInfo?: { label?: string } }[] }>(`${JUP}/quote?${q}`);
  if (!j.outAmount) throw new SwapError("No route right now.");
  return j;
}

// ---------- EVM (KyberSwap) ----------

interface KyberRoute { routeSummary: { amountOut: string; amountInUsd?: string; amountOutUsd?: string; route?: Array<Array<{ exchange?: string }>> }; routerAddress: string }

async function kyberRoute(chain: Chain, token: string, amount: number): Promise<KyberRoute> {
  const slug = KYBER_CHAIN[chain];
  if (!slug) throw new SwapError("No router on this chain.");
  const q = new URLSearchParams({ tokenIn: NATIVE_EVM, tokenOut: token, amountIn: BigInt(Math.round(amount * 1e9)) * 10n ** 9n + "" });
  const bps = feeBps();
  const receiver = process.env.EVM_FEE_RECEIVER?.trim();
  if (bps && receiver && /^0x[0-9a-fA-F]{40}$/.test(receiver)) {
    q.set("feeAmount", String(bps));
    q.set("isInBps", "true");
    q.set("chargeFeeBy", "currency_in");
    q.set("feeReceiver", receiver);
  }
  const j = await json<{ code: number; message?: string; data?: KyberRoute }>(`${KYBER}/${slug}/api/v1/routes?${q}`, { headers: { "x-client-id": "sitesmith" } });
  if (j.code !== 0 || !j.data) throw new SwapError(j.message === "token not found" ? "This token has no route yet." : "No route right now.");
  return j.data;
}

function kyberVenue(r: KyberRoute): string {
  const ex = r.routeSummary.route?.[0]?.[0]?.exchange;
  return ex ? `${ex.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} via KyberSwap` : "KyberSwap";
}

// ---------- NEAR (neartrade developer API) ----------

const NT = "https://dev.neartrade.lol";
// A quote needs an account; before a wallet connects, price it for an existing one.
const QUOTE_ACCOUNT = "near";

interface NtQuote { venue: string; expectedOut: string; minOut: string; tokenDecimals: number | null; transactions: NearTx[]; account: string }

async function ntQuote(token: string, amount: number, account: string): Promise<NtQuote> {
  const key = process.env.NEARTRADE_API_KEY?.trim();
  const yocto = (BigInt(Math.round(amount * 1e6)) * 10n ** 18n).toString();
  const j = await json<NtQuote & { code?: string }>(`${NT}/v1/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) },
    body: JSON.stringify({ account, token, side: "buy", amount: yocto, slippageBps: SLIPPAGE_BPS }),
  });
  if (!j.expectedOut || !Array.isArray(j.transactions)) throw new SwapError("No route right now.");
  return j;
}

const VENUE: Record<string, string> = { rhea: "Rhea", nearly: "nearly.trade", memecooking: "Meme Cooking", grafun: "gra.fun", aidols: "AIdols", intear: "Intear", routr: "routr" };
const ntVenue = (v: string) => `${VENUE[v] ?? v} via neartrade`;

// ---------- shared ----------

export async function quote(chain: Chain, token: string, amount: number, decimals: number, account?: string): Promise<Quote> {
  if (chain === "near") {
    const j = await ntQuote(token, amount, account || QUOTE_ACCOUNT);
    return { venue: ntVenue(j.venue), out: Number(j.expectedOut) / 10 ** (j.tokenDecimals ?? decimals), impactPct: null, raw: j };
  }
  if (chain === "solana") {
    const j = await jupQuote(token, amount);
    return { venue: j.routePlan?.[0]?.swapInfo?.label ?? "Jupiter", out: Number(j.outAmount) / 10 ** decimals, impactPct: Number(j.priceImpactPct ?? 0) * 100, raw: j };
  }
  const r = await kyberRoute(chain, token, amount);
  const inUsd = Number(r.routeSummary.amountInUsd), outUsd = Number(r.routeSummary.amountOutUsd);
  return {
    venue: kyberVenue(r),
    out: Number(r.routeSummary.amountOut) / 10 ** decimals,
    impactPct: inUsd > 0 && outUsd > 0 ? Math.max(0, (1 - outUsd / inUsd) * 100) : null,
    raw: r,
  };
}

/** The unsigned transaction for this buy, built for the visitor's address. */
export async function build(chain: Chain, token: string, amount: number, decimals: number, user: string): Promise<BuiltTx> {
  if (chain === "near") {
    const j = await ntQuote(token, amount, user);
    const d = 10 ** (j.tokenDecimals ?? decimals);
    // Sent exactly as returned: the fee and storage registrations are part of them.
    return { kind: "near", signerId: user, transactions: j.transactions, out: Number(j.expectedOut) / d, minOut: Number(j.minOut) / d, venue: ntVenue(j.venue) };
  }
  if (chain === "solana") {
    const q = await jupQuote(token, amount);
    const fee = jupFee();
    const j = await json<{ swapTransaction?: string }>(`${JUP}/swap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: q,
        userPublicKey: user,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "high" } },
        ...(fee ? { feeAccount: fee.account } : {}),
      }),
    });
    if (!j.swapTransaction) throw new SwapError("Jupiter couldn't build the swap.");
    return { kind: "solana", tx: j.swapTransaction, out: Number(q.outAmount) / 10 ** decimals, venue: q.routePlan?.[0]?.swapInfo?.label ?? "Jupiter" };
  }
  const r = await kyberRoute(chain, token, amount);
  const j = await json<{ code: number; message?: string; data?: { data: string; routerAddress: string; transactionValue?: string; amountIn: string; amountOut: string; gas?: string } }>(
    `${KYBER}/${KYBER_CHAIN[chain]}/api/v1/route/build`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-id": "sitesmith" },
      body: JSON.stringify({ routeSummary: r.routeSummary, sender: user, recipient: user, slippageTolerance: SLIPPAGE_BPS, deadline: Math.floor(Date.now() / 1000) + 600 }),
    },
  );
  if (j.code !== 0 || !j.data) throw new SwapError(j.message || "KyberSwap couldn't build the swap.");
  const value = BigInt(j.data.transactionValue ?? j.data.amountIn);
  return { kind: "evm", to: j.data.routerAddress, data: j.data.data, value: "0x" + value.toString(16), gas: j.data.gas ? "0x" + Math.ceil(Number(j.data.gas) * 1.25).toString(16) : null, out: Number(j.data.amountOut) / 10 ** decimals, venue: kyberVenue(r) };
}
