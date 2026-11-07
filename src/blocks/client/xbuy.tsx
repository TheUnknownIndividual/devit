"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ArrowRightLeft, Check, ChevronDown, Copy, Loader2 } from "lucide-react";
import type { TokenInfo } from "@/lib/spec";
import type { NearTx } from "@/lib/swap";
import { NEAR_EVM, onboardTx, toEthTxs } from "@/lib/ethnear";
import { XCOINS, xcoin, fromUnits, toUnits, unitsToInput, type XCoin } from "@/lib/xpay";
import { evmSession, familyOf, short, switchEvm, useWallets } from "./wallet";
import { WalletButton } from "./connect";
import { num } from "../format";

// "Your wallet" on a NEAR token's site: buy or sell with ETH/USDC already in a connected Ethereum wallet, without
// leaving the page or making a NEAR wallet. The coins land in the visitor's own 0x account on NEAR (same address as
// their Ethereum wallet). Bridging runs through NEAR Intents; when the token isn't on Intents, the bridge lands wNEAR
// and neartrade's router swaps it on NEAR, signed by the same Ethereum wallet on NEAR's chain 397 (lib/ethnear.ts).

interface State {
  account: string;
  coins: Array<{ key: string; balance: string; price: number }>;
  token: { direct: boolean; decimals: number; price: number | null };
  near: { native: string; token: string; wnear: string; onboarded: boolean; relayerKey: string | null };
  sponsor: boolean;
}
interface Quote { route: "direct" | "swap"; depositAddress: string | null; out: number; outUsd: number | null; timeEstimate: number | null; transactions: NearTx[] }
type StepState = "todo" | "now" | "done" | "fail";
interface Step { text: string; state: StepState; sub?: string }

export function CoinMark({ symbol, size = 28 }: { symbol: string; size?: number }) {
  if (symbol === "ETH") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flex: "none" }}>
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <g fill="#fff"><path fillOpacity=".6" d="M16.5 4v8.87l7.5 3.35z" /><path d="M16.5 4 9 16.22l7.5-3.35z" /><path fillOpacity=".6" d="M16.5 21.97V28L24 17.62z" /><path d="M16.5 28v-6.03L9 17.62z" /><path fillOpacity=".2" d="m16.5 20.57 7.5-4.35-7.5-3.35z" /><path fillOpacity=".6" d="m9 16.22 7.5 4.35v-7.7z" /></g>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flex: "none" }}>
      <circle cx="16" cy="16" r="16" fill={symbol === "USDT" ? "#26A17B" : "#2775CA"} />
      <text x="16" y="21.5" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{symbol === "USDT" ? "₮" : "$"}</text>
    </svg>
  );
}

const usdFmt = (n: number) => (n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${n.toPrecision(2)}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cancelled = (e: unknown) => (e as { code?: number }).code === 4001 || /reject|denied|cancel/i.test((e as Error)?.message ?? "");

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/xbuy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({ error: "No answer from the server" }))) as T & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error || "Something went wrong");
  return j;
}

async function receipt(hash: string): Promise<{ status?: string; nearTransactionHash?: string }> {
  const s = evmSession();
  for (let i = 0; i < 90 && s; i++) {
    const r = (await s.provider.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null)) as { status?: string; nearTransactionHash?: string } | null;
    if (r?.status) return r;
    await wait(2000);
  }
  throw new Error("The transaction is taking too long to confirm. Check your wallet's activity.");
}

/** Waits for a 1-Click deposit to finish; throws on refund or failure. */
async function bridged(depositAddress: string, onStatus: (s: string) => void): Promise<void> {
  const end = Date.now() + 30 * 60_000;
  while (Date.now() < end) {
    const r = await fetch(`/api/intents/status?depositAddress=${encodeURIComponent(depositAddress)}`).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { status?: string; code?: string }) : null;
    if (j?.status) onStatus(j.status);
    if (j?.code === "SUCCESS") return;
    if (j?.code === "REFUNDED" || j?.code === "FAILED") throw new Error("The bridge couldn't fill this and refunded it. Try again with a fresh quote.");
    await wait(5000);
  }
  throw new Error("The bridge is still working. It finishes on its own; check back in a few minutes.");
}

const METHOD: Record<string, string> = {
  storage_deposit: "Register the account with the token (0.00125 NEAR)",
  ft_transfer_call: "Swap on NEAR",
  ft_transfer: "Transfer",
  near_withdraw: "Unwrap NEAR",
  near_deposit: "Wrap NEAR",
};

/** Signs NEAR transactions from the Ethereum wallet on chain 397, onboarding NEAR's relayer first if needed. */
async function signOnNear(txs: NearTx[], st: State, onStep: (s: string) => void): Promise<string | null> {
  const s = evmSession();
  if (!s) throw new Error("Connect an Ethereum wallet first.");
  if (!st.near.relayerKey) throw new Error("NEAR's relayer isn't answering right now. Try again in a minute.");
  onStep("Switch your wallet to NEAR");
  await switchEvm(NEAR_EVM);
  const list = [...(st.near.onboarded ? [] : [onboardTx(st.account, st.near.relayerKey)]), ...toEthTxs(txs, (_r, m) => (m ? METHOD[m] ?? m : "Send NEAR"))];
  let last: string | null = null;
  for (const [i, tx] of list.entries()) {
    onStep(`${i + 1} of ${list.length}: ${tx.label}`);
    const hash = (await s.provider.request({ method: "eth_sendTransaction", params: [{ from: s.address, to: tx.to, data: tx.data, value: tx.value, ...(tx.gasPrice ? { gasPrice: tx.gasPrice } : {}) }] })) as string;
    const r = await receipt(hash);
    if (r.status !== "0x1") throw new Error(`This step failed on NEAR: ${tx.label}.`);
    last = r.nearTransactionHash ?? last;
    // A swap's tokens arrive a few blocks after its call; the next step spends them.
    if (/Swap/.test(tx.label)) await wait(4000);
  }
  return last;
}

function CopyAddr({ address }: { address: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="ss-amt" style={{ marginTop: 10 }}>
      <code className="ss-mono" style={{ fontSize: 13, overflowWrap: "anywhere", minWidth: 0, flex: 1 }}>{address}</code>
      <button type="button" className="ss-btn ss-btn-ghost ss-btn-sm" onClick={() => { void navigator.clipboard?.writeText(address).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}>
        {ok ? <Check size={14} /> : <Copy size={14} />} {ok ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function WalletTrade({ token, ticker }: { token: TokenInfo; ticker: string }) {
  const { connected } = useWallets();
  const evm = connected && familyOf(connected.wallet) === "evm" ? connected.address : null;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [st, setSt] = useState<State | null>(null);
  const [coinKey, setCoinKey] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [amount, setAmount] = useState("");
  const [inUsd, setInUsd] = useState(false);
  const [q, setQ] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needNear, setNeedNear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!evm || token.demo) return;
    const r = await fetch(`/api/xbuy?evm=${evm}&token=${encodeURIComponent(token.address)}`).catch(() => null);
    if (r?.ok) setSt((await r.json()) as State);
  }, [evm, token.address, token.demo]);
  useEffect(() => { setSt(null); setCoinKey(null); void load(); }, [load]);

  // Pick the coin the wallet holds most of (by dollar value); with nothing, ETH on the chain the wallet is on.
  useEffect(() => {
    if (coinKey || (!st && !token.demo)) return;
    if (!st) { setCoinKey("eth:ETH"); return; }
    const best = [...st.coins].sort((a, b) => fromUnits(b.balance, xcoin(b.key)!.decimals) * b.price - fromUnits(a.balance, xcoin(a.key)!.decimals) * a.price)[0];
    const has = best && BigInt(best.balance) > 0n;
    const here = XCOINS.find((c) => c.symbol === "ETH" && c.chainId === connected?.chainId);
    setCoinKey(has ? best.key : here?.key ?? "eth:ETH");
  }, [st, coinKey, connected?.chainId, token.demo]);

  const coin = coinKey ? xcoin(coinKey) : null;
  const coinRow = st?.coins.find((c) => c.key === coinKey);
  const coinPrice = coinRow?.price || (coin?.symbol === "ETH" ? 3400 : 1);
  const tokenPrice = token.priceUsd ?? st?.token.price ?? null;
  const tokDec = st?.token.decimals ?? token.decimals ?? 18;
  // What the amount box is denominated in: the coin (buy) or the token (sell), or USD.
  const unitDec = side === "buy" ? coin?.decimals ?? 18 : tokDec;
  const unitPrice = side === "buy" ? coinPrice : tokenPrice;
  const unitSym = side === "buy" ? coin?.symbol ?? "ETH" : `$${ticker}`;
  const raw = useMemo(() => {
    const a = Number(amount);
    if (!(a > 0)) return 0n;
    if (!inUsd) return toUnits(amount, unitDec);
    if (!unitPrice) return 0n;
    const n = a / unitPrice;
    return toUnits(n.toFixed(Math.min(unitDec, n < 1 ? 12 : 6)), unitDec);
  }, [amount, inUsd, unitDec, unitPrice]);
  const balance = side === "buy" ? BigInt(coinRow?.balance ?? "0") : BigInt(st?.near.token ?? "0");
  const spendable = side === "buy" && coin?.reserve ? (balance > toUnits(coin.reserve, coin.decimals) ? balance - toUnits(coin.reserve, coin.decimals) : 0n) : balance;
  const tooMuch = raw > 0n && st && raw > balance;
  const other = raw > 0n && unitPrice ? (inUsd ? `${num(fromUnits(raw, unitDec))} ${unitSym}` : usdFmt(fromUnits(raw, unitDec) * unitPrice)) : null;

  // Dry quote as you type.
  useEffect(() => {
    setQ(null); setQErr(null);
    if (!coin || raw <= 0n || busy) return;
    if (token.demo) {
      const usdIn = fromUnits(raw, unitDec) * (unitPrice ?? 0);
      if (side === "buy" && tokenPrice) setQ({ route: "direct", depositAddress: null, out: (usdIn * 0.99) / tokenPrice, outUsd: usdIn * 0.99, timeEstimate: 45, transactions: [] });
      if (side === "sell") setQ({ route: "direct", depositAddress: null, out: (usdIn * 0.99) / coinPrice, outUsd: usdIn * 0.99, timeEstimate: 30, transactions: [] });
      return;
    }
    if (!evm) return;
    const h = setTimeout(() => {
      post<Quote>({ op: "quote", side, pay: coin.key, amount: raw.toString(), token: token.address, evm, dry: true }).then(setQ).catch((e: Error) => setQErr(e.message));
    }, 450);
    return () => clearTimeout(h);
  }, [coinKey, raw, side, evm, token.address, token.demo]);

  function reset() { setSteps(null); setErr(null); setDone(null); setNeedNear(false); }

  function stepper(texts: string[]) {
    let cur: Step[] = texts.map((text) => ({ text, state: "todo" as StepState }));
    setSteps(cur);
    const set = (i: number, state: StepState, sub?: string) => { cur = cur.map((s, j) => (j === i ? { ...s, state, sub } : s)); setSteps(cur); };
    return { set, failNow: () => { const i = cur.findIndex((s) => s.state === "now"); if (i >= 0) set(i, "fail", cur[i].sub); } };
  }

  async function gas(): Promise<void> {
    try {
      await post({ op: "gas", token: token.address, evm });
    } catch (e) {
      setNeedNear(true);
      throw e;
    }
  }

  async function buy() {
    const s = evmSession();
    if (!s || !coin || !st || raw <= 0n) return;
    reset(); setBusy(true);
    const direct = st.token.direct;
    const p = stepper(direct
      ? [`Send ${coin.symbol} from your wallet`, `Bridge to NEAR and buy $${ticker}`]
      : [`Send ${coin.symbol} from your wallet`, "Bridge to NEAR as wNEAR", "Gas for your NEAR account", `Swap for $${ticker} on NEAR`]);
    try {
      p.set(0, "now", "Getting a fresh quote");
      const fresh = await post<Quote>({ op: "quote", side: "buy", pay: coin.key, amount: raw.toString(), token: token.address, evm: s.address, dry: false });
      if (!fresh.depositAddress) throw new Error("No deposit address came back. Try again.");
      p.set(0, "now", `Switch to ${coin.chain}, then confirm`);
      await switchEvm({ chainId: coin.chainId, chainName: coin.chain, rpcUrls: [coin.rpc], blockExplorerUrls: [coin.explorer], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } });
      const tx = coin.contract
        ? { from: s.address, to: coin.contract, value: "0x0", data: "0xa9059cbb" + fresh.depositAddress.slice(2).toLowerCase().padStart(64, "0") + raw.toString(16).padStart(64, "0") }
        : { from: s.address, to: fresh.depositAddress, value: "0x" + raw.toString(16) };
      const hash = (await s.provider.request({ method: "eth_sendTransaction", params: [tx] })) as string;
      void post({ op: "submit", depositAddress: fresh.depositAddress, txHash: hash }).catch(() => undefined);
      p.set(0, "done", short(hash));
      p.set(1, "now", "Waiting for your deposit");
      await bridged(fresh.depositAddress, (t) => p.set(1, "now", t));
      p.set(1, "done");
      if (!direct) {
        p.set(2, "now");
        await gas();
        p.set(2, "done");
        p.set(3, "now", "Building the swap");
        const leg = await post<{ transactions: NearTx[]; out: number }>({ op: "leg", token: token.address, evm: s.address });
        await signOnNear(leg.transactions, st, (t) => p.set(3, "now", t));
        p.set(3, "done");
      }
      setDone(`$${ticker} is in your NEAR account ${short(st.account)}, the same address as your Ethereum wallet. Sell it from here any time.`);
      void load();
    } catch (e) {
      p.failNow();
      setErr(cancelled(e) ? "You cancelled in the wallet." : (e as Error).message || "That didn't go through.");
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function sell() {
    const s = evmSession();
    if (!s || !coin || !st || raw <= 0n) return;
    reset(); setBusy(true);
    const p = stepper(["Gas for your NEAR account", `Sell $${ticker} on NEAR`, `Bridge back as ${coin.symbol} on ${coin.chain}`]);
    try {
      p.set(0, "now");
      await gas();
      p.set(0, "done");
      p.set(1, "now", "Getting a fresh quote");
      const fresh = await post<Quote>({ op: "quote", side: "sell", pay: coin.key, amount: raw.toString(), token: token.address, evm: s.address, dry: false });
      if (!fresh.depositAddress || !fresh.transactions.length) throw new Error("No route came back. Try again.");
      const nearHash = await signOnNear(fresh.transactions, st, (t) => p.set(1, "now", t));
      if (nearHash) void post({ op: "submit", depositAddress: fresh.depositAddress, txHash: nearHash }).catch(() => undefined);
      p.set(1, "done");
      p.set(2, "now", "Bridging");
      await bridged(fresh.depositAddress, (t) => p.set(2, "now", t));
      p.set(2, "done");
      setDone(`${coin.symbol} is on its way to ${short(s.address)} on ${coin.chain}.`);
      void load();
    } catch (e) {
      p.failNow();
      setErr(cancelled(e) ? "You cancelled in the wallet." : (e as Error).message || "That didn't go through.");
      void load();
    } finally {
      setBusy(false);
    }
  }

  if (!evm && !token.demo) {
    return (
      <>
        <p className="ss-muted" style={{ margin: "0 0 12px", fontSize: 14 }}>Buy ${ticker} with ETH or USDC you already have on Ethereum, Base or Arbitrum. No NEAR wallet needed: it lands in the same address on NEAR.</p>
        <WalletButton chain="ethereum" token={token} block />
      </>
    );
  }

  const coinBal = (c: XCoin) => fromUnits(st?.coins.find((x) => x.key === c.key)?.balance ?? "0", c.decimals);
  const outSym = side === "buy" ? `$${ticker}` : coin?.symbol ?? "ETH";

  return (
    <>
      <div className="ss-route" role="radiogroup" aria-label="Buy or sell">
        {([["buy", "Buy", `Pay with ${coin?.symbol ?? "ETH"}`], ["sell", "Sell", `Get ${coin?.symbol ?? "ETH"} back`]] as const).map(([k, name, sub]) => (
          <button key={k} type="button" role="radio" aria-checked={side === k} disabled={busy} onClick={() => { setSide(k); setAmount(""); setInUsd(false); reset(); }}>
            <b>{name}</b><span>{sub}</span>
          </button>
        ))}
      </div>

      <span className="ss-label">{side === "buy" ? "Pay with" : "Get back"}</span>
      {coin && (
        <button type="button" className="ss-coin" aria-expanded={picking} disabled={busy} onClick={() => setPicking((v) => !v)}>
          <CoinMark symbol={coin.symbol} />
          <span className="ss-coin-name"><b>{coin.symbol}</b><span>on {coin.chain}</span></span>
          {st && <span className="ss-coin-bal">{num(coinBal(coin))}</span>}
          <ChevronDown size={16} aria-hidden />
        </button>
      )}
      {picking && (
        <div className="ss-coins" role="listbox" aria-label="Coins in your wallet">
          {XCOINS.map((c) => (
            <button key={c.key} type="button" role="option" aria-selected={c.key === coinKey} className="ss-coin" onClick={() => { setCoinKey(c.key); setPicking(false); }}>
              <CoinMark symbol={c.symbol} size={24} />
              <span className="ss-coin-name"><b>{c.symbol}</b><span>on {c.chain}</span></span>
              {st && <span className="ss-coin-bal">{num(coinBal(c))}</span>}
            </button>
          ))}
        </div>
      )}

      <label className="ss-label" htmlFor="ss-xamt">{side === "buy" ? "Amount" : `Sell ($${ticker})`}</label>
      <div className="ss-amt">
        <input id="ss-xamt" className="ss-input" inputMode="decimal" placeholder="0" value={amount} disabled={busy} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); reset(); }} />
        <button type="button" className="ss-btn ss-btn-ghost ss-btn-sm" disabled={busy || !unitPrice} title="Switch between the coin and US dollars" onClick={() => {
          if (raw > 0n && unitPrice) setAmount(inUsd ? unitsToInput(raw, unitDec, 6) : (fromUnits(raw, unitDec) * unitPrice).toFixed(2));
          setInUsd((v) => !v);
        }}>
          <ArrowDownUp size={14} /> {inUsd ? "USD" : side === "buy" ? coin?.symbol ?? "ETH" : ticker}
        </button>
      </div>
      <div className="ss-note" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span>{other ? `≈ ${other}` : " "}</span>
        {st && (
          <button type="button" className="ss-link-btn" disabled={busy || spendable <= 0n} onClick={() => { setInUsd(false); setAmount(unitsToInput(spendable, unitDec, 8)); reset(); }}>
            Balance {num(fromUnits(balance, unitDec))} {unitSym} · Max
          </button>
        )}
      </div>

      {q && (
        <div className="ss-quote">
          You get about <b>{num(q.out)}</b> {outSym}{q.outUsd ? <span className="ss-muted"> (≈ {usdFmt(q.outUsd)})</span> : null}
          <div className="ss-note">
            {side === "buy"
              ? q.route === "direct" ? "Bridged and bought in one step by NEAR Intents." : "Bridged by NEAR Intents, then swapped on NEAR by neartrade's router."
              : q.route === "direct" ? "Sold and bridged in one step by NEAR Intents." : "Swapped on NEAR by neartrade's router, then bridged by NEAR Intents."}
            {q.timeEstimate ? ` About ${q.timeEstimate < 90 ? `${Math.max(10, Math.round(q.timeEstimate / 5) * 5)} s` : `${Math.round(q.timeEstimate / 60)} min`}.` : ""}
            {st ? ` Your NEAR account: ${short(st.account)}.` : ""}
          </div>
        </div>
      )}
      {qErr && !steps && <div className="ss-err">{qErr}</div>}
      {tooMuch && <div className="ss-err">More than you hold.</div>}

      {steps && (
        <ol className="ss-steps">
          {steps.map((s, i) => (
            <li key={i} data-state={s.state}>
              <span className="ss-step-ic" aria-hidden>{s.state === "done" ? <Check size={13} /> : s.state === "now" ? <Loader2 size={13} className="ss-spin" /> : i + 1}</span>
              <span className="ss-step-tx">{s.text}{s.sub && <span>{s.sub}</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {done && (
        <div className="ss-quote" style={{ borderColor: "var(--accent)" }}>
          <Check size={15} style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} />{done}
          {st && <div className="ss-note"><a href={`https://nearblocks.io/address/${st.account}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>See your NEAR account</a></div>}
        </div>
      )}
      {err && <div className="ss-err">{err}</div>}
      {needNear && st && (
        <div className="ss-quote">
          Your NEAR address (the same as your Ethereum one):
          <CopyAddr address={st.account} />
        </div>
      )}

      <button
        type="button"
        className="ss-btn"
        style={{ width: "100%", marginTop: 14 }}
        disabled={!!token.demo || busy || raw <= 0n || !q || !!tooMuch}
        title={token.demo ? "This is a sample site with a made-up token" : undefined}
        onClick={() => void (side === "buy" ? buy() : sell())}
      >
        {busy ? <Loader2 size={16} className="ss-spin" /> : <ArrowRightLeft size={16} />}
        {busy ? "Working…" : side === "buy" ? `Buy $${ticker}` : `Sell $${ticker}`}
      </button>
      {!token.demo && <div className="ss-note">Every step is signed in your own wallet. The coins stay in your account.</div>}
    </>
  );
}
