import { rpcFor } from "./chain";
import { oneClickTokens } from "./intents";
import { b58encode } from "./solana";
import type { NearTx } from "./swap";
import { RELAYER_RPC } from "./ethnear";
import { XCOINS, xcoin, fromUnits } from "./xpay";
import { restoreOwed, sponsorAccount, takeOwed } from "./nearsponsor";

// Buy or sell a NEAR token straight from an Ethereum wallet. The coins stay in the visitor's own 0x account on NEAR
// (every 0x address is a NEAR account, NEP-518), so nothing is created or held for them.
//  - Token listed on NEAR Intents 1-Click: one bridge does it all (ETH → token on buy, token → ETH on sell).
//  - Not listed: 1-Click bridges to wNEAR and neartrade's router swaps on NEAR, signed by the same Ethereum wallet.

const ONECLICK = process.env.ONECLICK_URL || "https://1click.chaindefuser.com";
const NT = "https://dev.neartrade.lol";
const WNEAR = "wrap.near";
const STORAGE = "1250000000000000000000"; // 0.00125 NEAR, a fungible token's storage registration
const TIMEOUT = 10_000;

export const isEthAccount = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

// ---------- NEAR reads ----------

async function nearRpc<T>(method: string, params: unknown): Promise<T | null> {
  try {
    const r = await fetch(rpcFor("near"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
    const j = (await r.json()) as { result?: T; error?: unknown };
    return j.result ?? null;
  } catch {
    return null;
  }
}

export async function nearView<T>(contract: string, method: string, args: Record<string, unknown>): Promise<T | null> {
  const r = await nearRpc<{ result?: number[] }>("query", { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  if (!r?.result) return null;
  try { return JSON.parse(Buffer.from(r.result).toString()) as T; } catch { return null; }
}

export async function nativeBalance(account: string): Promise<bigint> {
  const r = await nearRpc<{ amount?: string }>("query", { request_type: "view_account", finality: "final", account_id: account });
  return BigInt(r?.amount ?? "0");
}
export async function ftBalance(contract: string, account: string): Promise<bigint> {
  return BigInt((await nearView<string>(contract, "ft_balance_of", { account_id: account })) ?? "0");
}
const registered = async (contract: string, account: string) => (await nearView<unknown>(contract, "storage_balance_of", { account_id: account })) != null;

const decimalsCache = new Map<string, number>();
export async function ftDecimals(contract: string): Promise<number> {
  if (decimalsCache.has(contract)) return decimalsCache.get(contract)!;
  const m = await nearView<{ decimals?: number }>(contract, "ft_metadata", {});
  const d = typeof m?.decimals === "number" ? m.decimals : 18;
  decimalsCache.set(contract, d);
  return d;
}

let relayer: { at: number; hex: string } | null = null;
/** NEAR's relayer key (hex). Onboarding adds it to the account, limited to rlp_execute. */
export async function relayerKey(): Promise<string | null> {
  if (relayer && Date.now() - relayer.at < 3600_000) return relayer.hex;
  try {
    const r = await fetch(RELAYER_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "near_getPublicKey", params: [] }), signal: AbortSignal.timeout(TIMEOUT) });
    const hex = ((await r.json()) as { result?: { public_key?: string } }).result?.public_key;
    if (!hex || !/^[0-9a-f]{64}$/.test(hex)) return relayer?.hex ?? null;
    relayer = { at: Date.now(), hex };
    return hex;
  } catch {
    return relayer?.hex ?? null;
  }
}
async function onboarded(account: string, hex: string | null): Promise<boolean> {
  if (!hex) return false;
  const key = "ed25519:" + b58encode(Uint8Array.from(hex.match(/../g)!.map((x) => parseInt(x, 16))));
  return (await nearRpc<unknown>("query", { request_type: "view_access_key", finality: "final", account_id: account, public_key: key })) != null;
}

// ---------- Ethereum-side balances ----------

async function evmCall(rpc: string, method: string, params: unknown[]): Promise<string | null> {
  try {
    const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(8000) });
    return ((await r.json()) as { result?: string }).result ?? null;
  } catch {
    return null;
  }
}
function rpcOf(chainId: string, fallback: string): string {
  if (chainId === "0x1") return rpcFor("ethereum");
  if (chainId === "0x2105") return rpcFor("base");
  return fallback;
}

// ---------- state ----------

export interface XState {
  account: string;
  coins: Array<{ key: string; balance: string; price: number }>;
  token: { direct: boolean; decimals: number; price: number | null };
  near: { native: string; token: string; wnear: string; onboarded: boolean; relayerKey: string | null };
}

async function listed(token: string) {
  const list = await oneClickTokens();
  return { list, hit: list.find((x) => x.blockchain === "near" && x.assetId === `nep141:${token}`) ?? null };
}

export async function xState(evm: string, token: string): Promise<XState> {
  const account = evm.toLowerCase();
  const pad = account.slice(2).padStart(64, "0");
  const [{ list, hit }, rk, coins, native, tok, wn, decimals] = await Promise.all([
    listed(token),
    relayerKey(),
    Promise.all(XCOINS.map(async (c) => {
      const rpc = rpcOf(c.chainId, c.rpc);
      const v = c.contract ? await evmCall(rpc, "eth_call", [{ to: c.contract, data: "0x70a08231" + pad }, "latest"]) : await evmCall(rpc, "eth_getBalance", [account, "latest"]);
      return { key: c.key, balance: v && v !== "0x" ? BigInt(v).toString() : "0" };
    })),
    nativeBalance(account),
    ftBalance(token, account),
    ftBalance(WNEAR, account),
    ftDecimals(token),
  ]);
  const price = (asset: string) => list.find((x) => x.assetId === asset)?.price ?? 0;
  return {
    account,
    coins: coins.map((c) => ({ ...c, price: price(xcoin(c.key)!.asset) })),
    token: { direct: !!hit, decimals: hit?.decimals ?? decimals, price: hit?.price ?? null },
    near: { native: native.toString(), token: tok.toString(), wnear: wn.toString(), onboarded: await onboarded(account, rk), relayerKey: rk },
  };
}

// ---------- 1-Click ----------

interface OneClickQuote { depositAddress?: string; amountIn: string; amountOut: string; amountOutFormatted: string; amountOutUsd?: string; minAmountOut?: string; timeEstimate?: number }

async function oneClick(o: { origin: string; dest: string; amount: string; recipient: string; refundTo: string; dry: boolean; extraFees?: Array<{ recipient: string; fee: number }> }): Promise<OneClickQuote | { error: string }> {
  const body: Record<string, unknown> = {
    dry: o.dry, swapType: "EXACT_INPUT", slippageTolerance: 100,
    originAsset: o.origin, depositType: "ORIGIN_CHAIN", destinationAsset: o.dest, amount: o.amount,
    refundTo: o.refundTo, refundType: "ORIGIN_CHAIN", recipient: o.recipient, recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 60 * 60_000).toISOString(), referral: "devit",
  };
  const fee = Number(process.env.ONECLICK_FEE_BPS || 0);
  const fees = [...(fee > 0 && process.env.ONECLICK_FEE_RECIPIENT ? [{ recipient: process.env.ONECLICK_FEE_RECIPIENT, fee }] : []), ...(o.extraFees ?? [])];
  if (fees.length) body.appFees = fees;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  try {
    const r = await fetch(`${ONECLICK}/v0/quote`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
    const j = (await r.json()) as { message?: string; quote?: OneClickQuote };
    if (!r.ok || !j.quote) return { error: /too low|minimum swap amount/i.test(j.message ?? "") ? "That amount is too small for this route. Try a bit more." : j.message || "No quote right now" };
    return j.quote;
  } catch {
    return { error: "NEAR Intents didn't answer in time" };
  }
}

export async function submitDeposit(depositAddress: string, txHash: string): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  await fetch(`${ONECLICK}/v0/deposit/submit`, { method: "POST", headers, body: JSON.stringify({ txHash, depositAddress }), signal: AbortSignal.timeout(8000) }).catch(() => undefined);
}

// ---------- neartrade ----------

interface NtQuote { venue: string; expectedOut: string; minOut: string; tokenDecimals: number | null; transactions: NearTx[] }

async function ntQuote(token: string, side: "buy" | "sell", amount: string, account: string): Promise<NtQuote | { error: string }> {
  const key = process.env.NEARTRADE_API_KEY?.trim();
  try {
    const r = await fetch(`${NT}/v1/quote`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) }, body: JSON.stringify({ account, token, side, amount, slippageBps: 300 }), cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
    const j = (await r.json()) as NtQuote & { error?: string };
    if (!r.ok || !j.expectedOut || !Array.isArray(j.transactions)) return { error: j.error || "No route on NEAR for this token right now." };
    return j;
  } catch {
    return { error: "neartrade's router didn't answer in time." };
  }
}

const fc = (receiverId: string, methodName: string, args: Record<string, unknown>, deposit: string, gas = "15000000000000"): NearTx => ({ receiverId, actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }] });

/** Drops storage registrations the account already has, and any action whose method is in `drop`. */
async function prune(txs: NearTx[], account: string, drop: string[]): Promise<NearTx[]> {
  const out: NearTx[] = [];
  for (const tx of txs) {
    const actions = [];
    for (const a of tx.actions) {
      const m = String(a.params.methodName ?? "");
      if (drop.includes(m)) continue;
      if (m === "storage_deposit") {
        const who = String((a.params.args as { account_id?: string } | undefined)?.account_id ?? account);
        if (await registered(tx.receiverId, who)) continue;
      }
      actions.push(a);
    }
    if (actions.length) out.push({ ...tx, actions });
  }
  return out;
}

/** Sends `amount` of `contract` from the account to a 1-Click deposit address, registering the address first if needed. */
async function depositTxs(contract: string, depositAddress: string, amount: string): Promise<NearTx[]> {
  const txs: NearTx[] = [];
  if (!(await registered(contract, depositAddress))) txs.push(fc(contract, "storage_deposit", { account_id: depositAddress, registration_only: true }, STORAGE));
  txs.push(fc(contract, "ft_transfer", { receiver_id: depositAddress, amount }, "1", "30000000000000"));
  return txs;
}

/** Pays the sponsor back in wNEAR from inside the trade (registers the sponsor with wrap.near first if it isn't). */
function repayTxs(owed: bigint): NearTx[] {
  const to = sponsorAccount();
  if (!to || owed <= 0n) return [];
  return [fc(WNEAR, "storage_deposit", { account_id: to, registration_only: true }, STORAGE), fc(WNEAR, "ft_transfer", { receiver_id: to, amount: owed.toString(), memo: "starter NEAR repaid" }, "1")];
}

// ---------- quotes ----------

export interface XQuote {
  route: "direct" | "swap";
  depositAddress: string | null;
  /** Buy: tokens out. Sell: coin out. Human units. */
  out: number;
  outUsd: number | null;
  timeEstimate: number | null;
  /** NEAR transactions the Ethereum wallet signs (sell only; a buy's NEAR leg is built once the bridge lands). */
  transactions: NearTx[];
}

export async function xQuote(o: { side: "buy" | "sell"; pay: string; amount: string; token: string; evm: string; dry: boolean }): Promise<XQuote | { error: string }> {
  const coin = xcoin(o.pay);
  if (!coin) return { error: "That coin isn't supported" };
  const account = o.evm.toLowerCase();
  const { hit } = await listed(o.token);
  const decimals = hit?.decimals ?? (await ftDecimals(o.token));

  if (o.side === "buy") {
    const q = await oneClick({ origin: coin.asset, dest: hit ? hit.assetId : `nep141:${WNEAR}`, amount: o.amount, recipient: account, refundTo: o.evm, dry: o.dry });
    if ("error" in q) return q;
    const base = { depositAddress: q.depositAddress ?? null, outUsd: q.amountOutUsd ? Number(q.amountOutUsd) : null, timeEstimate: q.timeEstimate ?? null, transactions: [] };
    if (hit) return { route: "direct", out: Number(q.amountOutFormatted), ...base };
    // The NEAR leg swaps whatever wNEAR lands; price it now so the buyer sees tokens, not wNEAR.
    const nt = await ntQuote(o.token, "buy", q.minAmountOut ?? q.amountOut, isEthAccount(account) ? account : "near");
    if ("error" in nt) return nt;
    return { route: "swap", out: fromUnits(nt.expectedOut, nt.tokenDecimals ?? decimals), ...base };
  }

  // Sell
  if (hit) {
    // Starter NEAR fronted for this sell comes back as a 1-Click app fee to the sponsor, sized to the same dollar value.
    const owed = o.dry ? 0n : await takeOwed(account);
    let extraFees: Array<{ recipient: string; fee: number }> | undefined;
    if (owed > 0n) {
      const list = await oneClickTokens();
      const nearUsd = list.find((x) => x.assetId === `nep141:${WNEAR}`)?.price ?? 0;
      const tradeUsd = fromUnits(o.amount, decimals) * hit.price;
      const bps = tradeUsd > 0 ? Math.max(1, Math.ceil((fromUnits(owed, 24) * nearUsd * 10_000) / tradeUsd)) : 10_000;
      if (bps > 500) { await restoreOwed(account, owed); return { error: "That amount is too small to sell. Try a bit more." }; }
      extraFees = [{ recipient: sponsorAccount()!, fee: bps }];
    }
    const q = await oneClick({ origin: hit.assetId, dest: coin.asset, amount: o.amount, recipient: o.evm, refundTo: account, dry: o.dry, extraFees });
    if ("error" in q) { await restoreOwed(account, owed); return q; }
    return { route: "direct", depositAddress: q.depositAddress ?? null, out: Number(q.amountOutFormatted), outUsd: q.amountOutUsd ? Number(q.amountOutUsd) : null, timeEstimate: q.timeEstimate ?? null, transactions: q.depositAddress && !o.dry ? await depositTxs(o.token, q.depositAddress, o.amount) : [] };
  }
  const nt = await ntQuote(o.token, "sell", o.amount, account);
  if ("error" in nt) return nt;
  // neartrade pays its fee in native NEAR after unwrapping; here everything stays wNEAR so it can go straight into the bridge.
  let fees = 0n;
  const legs: NearTx[] = [];
  for (const tx of nt.transactions) {
    if (tx.actions.every((a) => a.type === "Transfer")) {
      for (const a of tx.actions) { const d = String(a.params.deposit ?? "0"); fees += BigInt(d); legs.push(fc(WNEAR, "ft_transfer", { receiver_id: tx.receiverId, amount: d, memo: "neartrade fee" }, "1")); }
    } else legs.push(tx);
  }
  const owed = o.dry ? 0n : await takeOwed(account);
  const net = BigInt(nt.minOut) - fees - owed;
  if (net <= 0n) { await restoreOwed(account, owed); return { error: "That amount is too small to sell." }; }
  const q = await oneClick({ origin: `nep141:${WNEAR}`, dest: coin.asset, amount: net.toString(), recipient: o.evm, refundTo: account, dry: o.dry });
  if ("error" in q) { await restoreOwed(account, owed); return q; }
  const transactions = o.dry || !q.depositAddress ? [] : [...(await prune([...legs, ...repayTxs(owed)], account, ["near_withdraw"])), ...(await depositTxs(WNEAR, q.depositAddress, net.toString()))];
  return { route: "swap", depositAddress: q.depositAddress ?? null, out: Number(q.amountOutFormatted), outUsd: q.amountOutUsd ? Number(q.amountOutUsd) : null, timeEstimate: q.timeEstimate ?? null, transactions };
}

/** Buy, second leg: swap the wNEAR the bridge delivered for the token, signed by the Ethereum wallet. */
export async function xSwapLeg(evm: string, token: string): Promise<{ transactions: NearTx[]; out: number } | { error: string }> {
  const account = evm.toLowerCase();
  const w = await ftBalance(WNEAR, account);
  if (w <= 0n) return { error: "The bridged wNEAR hasn't arrived yet." };
  // Starter NEAR fronted for this buy is paid back first, out of the bridged wNEAR.
  const owed = await takeOwed(account);
  if (w <= owed) { await restoreOwed(account, owed); return { error: "Too little wNEAR arrived to swap." }; }
  const nt = await ntQuote(token, "buy", (w - owed).toString(), account);
  if ("error" in nt) { await restoreOwed(account, owed); return nt; }
  // Already wrapped: skip neartrade's wrap step.
  const transactions = await prune([...repayTxs(owed), ...nt.transactions], account, ["near_deposit"]);
  return { transactions, out: fromUnits(nt.expectedOut, nt.tokenDecimals ?? (await ftDecimals(token))) };
}

