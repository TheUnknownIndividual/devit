"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { CHAINS, type Chain, type TokenInfo } from "@/lib/spec";
import { ago, num, usd } from "../format";
import { CopyCA, demoWho, useLiveToken, type Mode, type Trade } from "./parts";
import { short } from "./wallet";

// The social blocks: buy toasts, top buyers, "what if you'd bought", raid posts and market cap milestones.
// Live pages read the same trades feed as the Live trades block. The builder preview never fetches, moves or pops:
// it shows the token's saved snapshot, or one sample. A made-up showcase token animates on its own and fetches nothing.

const DAY = 86_400_000;
const tkey = (t: Trade) => `${t.who}|${t.at}|${t.usd}`;

/** Where a wallet is looked up: the chain's explorer, address page. */
export function addressUrl(chain: Chain, who: string): string {
  if (chain === "solana") return `https://solscan.io/account/${who}`;
  return `${CHAINS[chain].explorer.replace("/token/", "/address/")}${who}`;
}

/** Recent trades gathered while the page is open (the feed only carries the latest few), newest first. */
function useTrades(token: TokenInfo | null, mode: Mode): Trade[] | null {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const seen = useRef(new Map<string, Trade>());
  useEffect(() => {
    if (!token?.pairAddress) return;
    const push = (list: Trade[]) => {
      const cut = Date.now() - DAY;
      for (const t of list) if (t.at > cut && t.usd > 0) seen.current.set(tkey(t), t);
      const all = [...seen.current.values()].sort((a, b) => b.at - a.at).slice(0, 300);
      seen.current = new Map(all.map((t) => [tkey(t), t]));
      setTrades(all);
    };
    if (token.demo) {
      const one = (at: number): Trade => ({ side: Math.random() < 0.7 ? "buy" : "sell", usd: Math.round(40 + Math.random() ** 2 * 3800), who: demoWho(), at });
      push(Array.from({ length: 14 }, (_, i) => one(Date.now() - (i + 1) * 41_000)));
      if (mode !== "live") return;
      const h = setInterval(() => push([one(Date.now())]), 3600);
      return () => clearInterval(h);
    }
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/trades?chain=${token.chain}&pool=${encodeURIComponent(token.pairAddress!)}`).catch(() => null);
      if (!stop && r?.ok) push(((await r.json()) as { trades: Trade[] }).trades);
    };
    void tick();
    if (mode !== "live") return () => { stop = true; };
    const h = setInterval(tick, 12_000);
    return () => { stop = true; clearInterval(h); };
  }, [token?.chain, token?.pairAddress, token?.demo, mode]);
  return trades;
}

// ---------- buy toasts ----------

export function BuyToasts({ token, ticker, mode, minUsd, seconds, blockId }: { token: TokenInfo | null; ticker: string; mode: Mode; minUsd: number; seconds: number; blockId?: string }) {
  const live = mode === "live";
  // Preview fetches nothing: one sample card stands in for the toasts.
  const trades = useTrades(live ? token : null, mode);
  const seen = useRef<Set<string> | null>(null);
  const queue = useRef<Trade[]>([]);
  const [cur, setCur] = useState<Trade | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!trades) return;
    const buys = trades.filter((t) => t.side === "buy" && t.usd >= minUsd);
    if (!seen.current) {
      // First batch: the trades already there are history. Show only the newest, if it is recent.
      seen.current = new Set(trades.map(tkey));
      const top = buys[0];
      if (top && (token?.demo || Date.now() - top.at < 15 * 60_000)) queue.current = [top];
    } else {
      const fresh = buys.filter((t) => !seen.current!.has(tkey(t))).reverse();
      for (const t of trades) seen.current.add(tkey(t));
      queue.current = [...queue.current, ...fresh].slice(-4);
    }
    bump((n) => n + 1);
  }, [trades, minUsd, token?.demo]);

  useEffect(() => {
    if (cur || !queue.current.length) return;
    const next = queue.current.shift()!;
    const h = setTimeout(() => setCur(next), 400);
    return () => clearTimeout(h);
  });
  useEffect(() => {
    if (!cur) return;
    const h = setTimeout(() => setCur(null), Math.max(3, seconds) * 1000);
    return () => clearTimeout(h);
  }, [cur, seconds]);

  const card = (t: { who: string; usd: number; at: number }, close?: () => void) => (
    <div className="ss-toast" role="status" aria-live="polite" data-el="toast">
      <span><b>{short(t.who)}</b> bought <b>{usd(t.usd)}</b> of ${ticker}<span className="ss-toast-when">{ago(t.at)} ago</span></span>
      {close && <button type="button" className="ss-toast-x" onClick={close} aria-label="Dismiss"><X size={14} /></button>}
    </div>
  );

  if (!live) {
    const sample = { who: "0x12a4f09c7bd13e5a88c0ab", usd: Math.max(420, minUsd), at: Date.now() - 12_000 };
    return <div className="ss-toast-dock ss-toast-sample" data-block-id={blockId} data-block-type="toasts" data-block-label="Buy toasts">{card(sample)}</div>;
  }
  if (!cur) return null;
  return <div className="ss-toast-dock">{card(cur, () => { queue.current = []; setCur(null); })}</div>;
}

// ---------- top buyers ----------

export function Leaderboard({ token, mode, count }: { token: TokenInfo | null; mode: Mode; count: number }) {
  const trades = useTrades(token, mode);
  const rows = useMemo(() => {
    const by = new Map<string, { who: string; total: number; n: number }>();
    for (const t of trades ?? []) {
      if (t.side !== "buy") continue;
      const r = by.get(t.who) ?? { who: t.who, total: 0, n: 0 };
      r.total += t.usd;
      r.n += 1;
      by.set(t.who, r);
    }
    return [...by.values()].sort((a, b) => b.total - a.total).slice(0, count);
  }, [trades, count]);

  if (!token?.pairAddress) return <div className="ss-card ss-muted">Top buyers show here once the token has a trading pair.</div>;
  if (!trades) return <div className="ss-card ss-muted">Loading buyers…</div>;
  if (!rows.length) return <div className="ss-card ss-muted">No buys seen yet.</div>;
  return (
    <div className="ss-card ss-lb" style={{ padding: "8px 16px" }}>
      <table className="ss-trades">
        <thead className="ss-muted"><tr><th style={{ textAlign: "left", fontWeight: 600, fontSize: 12, padding: "8px" }}>Rank</th><th style={{ textAlign: "left", fontWeight: 600, fontSize: 12 }}>Wallet</th><th style={{ textAlign: "right", fontWeight: 600, fontSize: 12 }}>Bought</th><th style={{ textAlign: "right", fontWeight: 600, fontSize: 12 }}>Buys</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.who}>
              <td>{i + 1}</td>
              <td className="ss-mono">{token.demo ? short(r.who) : <a href={addressUrl(token.chain, r.who)} target="_blank" rel="noreferrer">{short(r.who)}</a>}</td>
              <td style={{ fontWeight: 700, textAlign: "right" }}>{usd(r.total)}</td>
              <td className="ss-lb-n">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ss-note" style={{ margin: "4px 8px 8px" }}>Ranked from the buys seen while this page has been open.</div>
    </div>
  );
}

// ---------- what if you'd bought ----------

type Span = "h1" | "h24" | "d7" | "launch";
const SPANS: Array<[Span, string, string]> = [["h1", "1h", "an hour"], ["h24", "24h", "a day"], ["d7", "7d", "a week"], ["launch", "Launch", "launch"]];
type Past = Record<Span, number | null>;

export function WhatIf({ token: initial, ticker, mode, amount: start }: { token: TokenInfo | null; ticker: string; mode: Mode; amount: number }) {
  const token = useLiveToken(initial, mode);
  const [amount, setAmount] = useState(String(start));
  const [span, setSpan] = useState<Span>("h24");
  const [hist, setHist] = useState<Past | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initial?.pairAddress || initial.demo || mode !== "live") return;
    let stop = false;
    void fetch(`/api/ohlcv?chain=${initial.chain}&pool=${encodeURIComponent(initial.pairAddress)}`).then((r) => (r.ok ? r.json() : null)).then((b: { h1: number | null; h24: number | null; d7: number | null; launch: number | null } | null) => {
      if (!stop && b) setHist({ h1: b.h1, h24: b.h24, d7: b.d7, launch: b.launch });
    }).catch(() => {});
    return () => { stop = true; };
  }, [initial?.chain, initial?.pairAddress, initial?.demo, mode]);

  const now = token?.priceUsd ?? null;
  // The 24h price can always come from the token's own 24h change; the rest need the candles (live pages).
  const fromChange = now != null && token?.change24h != null && token.change24h > -99 ? now / (1 + token.change24h / 100) : null;
  const past: Past = token?.demo && now
    ? { h1: now / 1.03, h24: fromChange ?? now / 1.12, d7: now / 1.9, launch: now / 6.5 }
    : { h1: hist?.h1 ?? null, h24: hist?.h24 ?? fromChange, d7: hist?.d7 ?? null, launch: hist?.launch ?? null };

  const amt = Number(amount);
  const then = past[span];
  const ok = now != null && then != null && then > 0 && amt > 0;
  const value = ok ? (amt * now!) / then! : null;
  const change = ok ? (now! / then! - 1) * 100 : null;
  const label = SPANS.find((x) => x[0] === span)![2];
  const sign = change != null && change >= 0 ? "+" : "";
  const shareText = ok ? `If I'd put ${usd(amt)} into $${ticker} ${span === "launch" ? "at launch" : `${label} ago`} it would be worth ${usd(value)} now (${sign}${change!.toFixed(0)}%).` : `Thinking about $${ticker}.`;
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(location.href.split("#")[0]), []);

  if (!initial) return <div className="ss-card ss-muted">This works once the site knows the token.</div>;
  return (
    <div className="ss-card ss-whatif" data-el="whatif">
      <div className="ss-whatif-row">
        <label className="ss-label" htmlFor="ss-whatif-amt" style={{ margin: 0 }}>If you had put in (USD)</label>
        <input id="ss-whatif-amt" className="ss-input ss-whatif-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        <div className="ss-seg" role="group" aria-label="How long ago">
          {SPANS.map(([k, name]) => <button key={k} type="button" aria-pressed={span === k} disabled={past[k] == null} onClick={() => setSpan(k)} title={past[k] == null ? (mode === "live" ? "No price for this far back" : "Shown on the live site") : undefined}>{name}</button>)}
        </div>
      </div>
      <div>
        <div className="ss-muted" style={{ fontSize: 14 }}>{span === "launch" ? "Since launch it would be worth" : `${label[0].toUpperCase()}${label.slice(1)} ago it would be worth`}</div>
        {ok ? (
          <div className="ss-whatif-big">
            {usd(value)}
            <small className={change! >= 0 ? "ss-up" : "ss-down"}>{sign}{change!.toFixed(change! > 999 || change! < -999 ? 0 : 1)}%</small>
          </div>
        ) : <div className="ss-whatif-big ss-muted">{now == null ? "No price yet" : "Pick another time"}</div>}
      </div>
      <div className="ss-raid-acts">
        <a className="ss-btn ss-btn-sm" href={`https://x.com/intent/post?text=${encodeURIComponent(`${shareText} ${url}`.trim())}`} target="_blank" rel="noreferrer">Share on X</a>
        <button type="button" className="ss-btn ss-btn-ghost ss-btn-sm" onClick={() => { void navigator.clipboard?.writeText(`${shareText} ${url}`.trim()); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button>
      </div>
      <div className="ss-note" style={{ margin: 0 }}>Past moves only, from public market data. Not a prediction or advice.</div>
    </div>
  );
}

// ---------- raid ----------

export const RAID_POSTS = [
  "$TICKER is live. CA: {ca}\n{url}",
  "Still early on $TICKER. Chart, buy box and the contract are all here: {url}",
  "$TICKER on {chain}. Do your own research, then look here: {url}\nCA: {ca}",
];

export function Raid({ ticker, chain, token, posts }: { ticker: string; chain: Chain; token: TokenInfo | null; posts: string[] }) {
  const [url, setUrl] = useState("");
  const [done, setDone] = useState<number | null>(null);
  useEffect(() => setUrl(location.href.split("#")[0]), []);
  const ca = token?.address ?? "[CONTRACT ADDRESS]";
  const fill = (t: string) => t.replace(/\$TICKER/g, `$${ticker}`).replace(/\{ca\}/g, ca).replace(/\{url\}/g, url || "[SITE LINK]").replace(/\{chain\}/g, CHAINS[chain].name);
  const copy = (i: number, text: string) => { void navigator.clipboard?.writeText(text); setDone(i); setTimeout(() => setDone(null), 1400); };
  return (
    <div className="ss-raid" data-el="raid">
      {posts.map((p, i) => {
        const text = fill(p);
        return (
          <div key={i} className="ss-card ss-raid-post" data-el={`post:${i + 1}`}>
            <p>{text}</p>
            <div className="ss-raid-acts">
              <a className="ss-btn ss-btn-sm" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Post on X</a>
              <button type="button" className="ss-btn ss-btn-ghost ss-btn-sm" onClick={() => copy(i, text)}>{done === i ? <Check size={14} /> : <Copy size={14} />}{done === i ? "Copied" : "Copy"}</button>
            </div>
          </div>
        );
      })}
      {token?.address && (
        <div>
          <div className="ss-muted" style={{ fontSize: 13, marginBottom: 8 }}>Contract address</div>
          <CopyCA address={token.address} />
        </div>
      )}
    </div>
  );
}

// ---------- milestones ----------

const MC_STEPS = [10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2.5e6, 5e6, 10e6, 25e6, 50e6, 100e6, 250e6, 500e6, 1e9, 2.5e9, 5e9, 10e9];
const HOLDER_STEPS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1e6];

function money(n: number): string {
  const f = (v: number, u: string) => `$${Number.isInteger(v) ? v : v.toFixed(1)}${u}`;
  return n >= 1e9 ? f(n / 1e9, "B") : n >= 1e6 ? f(n / 1e6, "M") : n >= 1e3 ? f(n / 1e3, "K") : `$${n}`;
}

function Goal({ label, value, steps, fmt }: { label: string; value: number; steps: number[]; fmt: (n: number) => string }) {
  const next = steps.find((s) => s > value) ?? null;
  const last = [...steps].reverse().find((s) => s <= value) ?? null;
  if (!next) return <div className="ss-card"><div className="ss-ms-big">{fmt(value)}</div><div className="ss-muted">{label}: past every milestone here.</div></div>;
  const p = Math.max(0, Math.min(100, (value / next) * 100));
  return (
    <div className="ss-card" data-el={`goal:${label}`}>
      <div className="ss-ms-head">
        <span className="ss-ms-big">{fmt(value)}</span>
        <span className="ss-muted">{label} · next {fmt(next)}</span>
      </div>
      <div className="ss-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={`${label} progress to ${fmt(next)}`}><i style={{ width: `${p}%` }} /></div>
      <div className="ss-muted" style={{ fontSize: 14 }}><b style={{ color: "var(--text)" }}>{p < 10 ? p.toFixed(1) : Math.round(p)}%</b> to {fmt(next)}{last ? ` · passed ${fmt(last)}` : ""}</div>
    </div>
  );
}

export function Milestones({ token: initial, mode }: { token: TokenInfo | null; mode: Mode }) {
  const token = useLiveToken(initial, mode);
  const mc = token?.marketCap ?? null;
  const holders = token?.holders ?? null;
  if (mc == null && holders == null) return <div className="ss-card ss-muted">Milestones show here once the token has a market cap.</div>;
  return (
    <div className="ss-grid ss-g2">
      {mc != null && <Goal label="Market cap" value={mc} steps={MC_STEPS} fmt={money} />}
      {holders != null && <Goal label="Holders" value={holders} steps={HOLDER_STEPS} fmt={(n) => num(n)} />}
    </div>
  );
}
