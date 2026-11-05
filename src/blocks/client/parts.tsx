"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, ArrowUp, Check, Copy, Globe2, Loader2, Shield } from "lucide-react";
import { CHAINS, isEvm, type Chain, type TokenInfo } from "@/lib/spec";
import { venue } from "@/lib/venues";
import { explorerTx, familyOf, sendEvm, sendNear, sendSolana, short, useWallets, waitEvm } from "./wallet";
import { WalletButton } from "./connect";
import type { BuiltTx } from "@/lib/swap";
import { ago, num, pct, usd } from "../format";

/** $0.0₅3057 with the zero count as a real subscript, since display fonts rarely carry the ₀-₉ glyphs. */
function SmallPrice({ text }: { text: string }) {
  const m = text.match(/^\$0\.0([₀-₉]+)(\d+)$/);
  if (!m) return <>{text}</>;
  const n = [...m[1]].map((c) => "₀₁₂₃₄₅₆₇₈₉".indexOf(c)).join("");
  return <>$0.0<sub style={{ fontSize: "0.55em", verticalAlign: "-0.15em" }}>{n}</sub>{m[2]}</>;
}

export type Mode = "preview" | "live";
export { WalletButton };

export function CopyCA({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="ss-ca" data-el="contract">
      <span title={address}>{address}</span>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(address); setDone(true); setTimeout(() => setDone(false), 1400); }} aria-label="Copy contract address">
        {done ? <Check size={14} /> : <Copy size={14} />}{done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ---------- live stats ----------

export function useLiveToken(initial: TokenInfo | null, mode: Mode): TokenInfo | null {
  const [t, setT] = useState(initial);
  useEffect(() => setT(initial), [initial]);
  useEffect(() => {
    if (mode !== "live" || !initial) return;
    if (initial.demo) {
      // The showcase's made-up token drifts a little every couple of seconds so the flashes and counters have something to do.
      const h = setInterval(() => setT((x) => {
        if (!x?.priceUsd) return x;
        const k = 1 + (Math.random() - 0.46) * 0.012;
        return { ...x, priceUsd: x.priceUsd * k, marketCap: x.marketCap != null ? x.marketCap * k : null, volume24h: x.volume24h != null ? x.volume24h + Math.random() * 900 : null, change24h: x.change24h != null ? x.change24h + (k - 1) * 100 : null };
      }), 2400);
      return () => clearInterval(h);
    }
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/token?chain=${initial.chain}&address=${encodeURIComponent(initial.address)}`).catch(() => null);
      if (!stop && r?.ok) setT((await r.json()) as TokenInfo);
    };
    const h = setInterval(tick, 30_000);
    return () => { stop = true; clearInterval(h); };
  }, [initial, mode]);
  return t;
}

const STAT_LABEL: Record<string, string> = { curve: "Bonding curve", price: "Price", marketCap: "Market cap", holders: "Holders", liquidity: "Liquidity", volume24h: "24h volume", change24h: "24h change", supply: "Supply" };

/** "up" or "down" for a moment after a live number moves, like a terminal's tick flash. */
function useFlash(v: number | null | undefined): string {
  const last = useRef(v);
  const [f, setF] = useState<{ dir: string; n: number }>({ dir: "", n: 0 });
  useEffect(() => {
    const prev = last.current;
    last.current = v;
    if (prev == null || v == null || prev === v) return;
    setF((x) => ({ dir: v > prev ? "up" : "down", n: x.n + 1 }));
    const h = setTimeout(() => setF((x) => ({ ...x, dir: "" })), 900);
    return () => clearTimeout(h);
  }, [v]);
  return f.dir ? ` ss-flash-${f.dir}` : "";
}

export function LiveStats({ token, items, mode, count = false }: { token: TokenInfo | null; items: string[]; mode: Mode; count?: boolean }) {
  const t = useLiveToken(token, mode);
  const flash = useFlash(t?.priceUsd);
  const val = (k: string): React.ReactNode => {
    if (!t) return "[ADD CA]";
    switch (k) {
      case "price": return <><SmallPrice text={usd(t.priceUsd)} /> {t.change24h != null && <span className={t.change24h >= 0 ? "ss-up" : "ss-down"} style={{ fontSize: 14 }}>{pct(t.change24h)}</span>}</>;
      case "marketCap": return <Count text={usd(t.marketCap)} on={count} />;
      case "holders": return <Count text={num(t.holders)} on={count} />;
      case "liquidity": return <Count text={usd(t.liquidityUsd)} on={count} />;
      case "volume24h": return <Count text={usd(t.volume24h)} on={count} />;
      case "change24h": return pct(t.change24h);
      case "supply": return <Count text={num(t.supply)} on={count} />;
      case "curve": return t.venue?.stage === "curve" ? (t.venue.progress != null ? `${Math.round(t.venue.progress * 100)}% sold` : "Live") : t.venue?.stage === "graduated" ? "Graduated" : "—";
      default: return "—";
    }
  };
  return (
    <>
      <div className="ss-grid ss-g4">
        {items.map((k) => (
          <div key={k} className="ss-card ss-stat" data-el={`stat:${k}`}>
            <div className="k">{STAT_LABEL[k] ?? k}</div>
            <div className={`v${k === "price" || k === "marketCap" ? flash : ""}`}>{val(k)}</div>
          </div>
        ))}
      </div>
      <div className="ss-src">{t ? `Live from ${t.sources.join(", ") || "the chain"}.` : "Paste a contract address in the builder chat to fill these in."}</div>
    </>
  );
}

// ---------- ticker + motion ----------

/** The slogan strip under the navigation: the ticker, live numbers when there's a token, and the tagline. */
export function Ticker({ token, ticker, tagline, chain, mode }: { token: TokenInfo | null; ticker: string; tagline: string; chain: Chain; mode: Mode }) {
  const t = useLiveToken(token, mode);
  const items: React.ReactNode[] = [<b key="t">${ticker}</b>];
  if (t?.priceUsd != null) items.push(<span key="p">{usd(t.priceUsd)}{t.change24h != null && <i className={t.change24h >= 0 ? "ss-up" : "ss-down"}> {pct(t.change24h)}</i>}</span>);
  if (t?.marketCap != null) items.push(<span key="m">MC {usd(t.marketCap)}</span>);
  if (t?.liquidityUsd != null) items.push(<span key="l">Liquidity {usd(t.liquidityUsd)}</span>);
  if (t?.volume24h != null) items.push(<span key="v">24h vol {usd(t.volume24h)}</span>);
  items.push(<span key="c">on {CHAINS[chain].name}</span>);
  if (tagline) items.push(<span key="g">{tagline}</span>);
  // Two copies side by side so the strip loops without a gap.
  const run = (copy: number) => items.map((x, i) => <span key={`${copy}-${i}`} className="ss-tick-item">{x}</span>);
  return (
    <div className="ss-ticker" data-el="ticker" aria-label={`$${ticker} ticker`}>
      <div className="ss-ticker-run">{run(0)}<span aria-hidden="true" style={{ display: "contents" }}>{run(1)}</span></div>
    </div>
  );
}

/** A formatted number ("$1.2M", "4,210") that counts up from zero the first time it scrolls into view. Static when `on` is off. */
export function Count({ text, on }: { text: string; on: boolean }) {
  const [shown, setShown] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);
  const latest = useRef(text);
  const done = useRef(false);
  latest.current = text;
  useEffect(() => {
    const m = on && !done.current ? text.match(/^([^\d]*)(\d[\d,]*(?:\.(\d+))?)(.*)$/s) : null;
    if (!m || !ref.current || matchMedia("(prefers-reduced-motion: reduce)").matches) { done.current = true; setShown(text); return; }
    const [, pre, num, frac, post] = m;
    const dec = frac?.length ?? 0, commas = num.includes(","), end = parseFloat(num.replace(/,/g, ""));
    const fmt = (v: number) => pre + (commas ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec)) + post;
    let raf = 0;
    const el = ref.current;
    if (el.getBoundingClientRect().top > innerHeight) setShown(fmt(0));
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 1100);
        if (k >= 1) { done.current = true; setShown(latest.current); return; }
        setShown(fmt(end * (1 - Math.pow(1 - k, 3))));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (done.current) setShown(text); }, [text]);
  return <span ref={ref} className="ss-count">{shown}</span>;
}

/** Live pages only: sections rise in as they scroll into view, plus the scroll-driven bits (nav, progress, active link, back-to-top). Without script nothing is hidden. */
export function MotionFx({ mode, toTop = true, progress = false, nav = true }: { mode: Mode; toTop?: boolean; progress?: boolean; nav?: boolean }) {
  const [top, setTop] = useState(false);
  useEffect(() => {
    if (mode !== "live") return;
    const root = document.querySelector<HTMLElement>(".ss");
    if (!root) return;
    const html = document.documentElement;
    // Anchor links land below the sticky nav (the ticker included).
    const header = root.querySelector<HTMLElement>(".ss-nav");
    const pad = () => { html.style.scrollPaddingTop = `${(header?.offsetHeight ?? 0) + 8}px`; };
    pad();
    addEventListener("resize", pad);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const longPage = () => document.documentElement.scrollHeight > innerHeight * 3;
    if (!still) html.style.scrollBehavior = "smooth";
    // One rAF-throttled scroll handler: parallax number, progress bar, compact nav, back-to-top.
    let raf = 0;
    const parallax = !still && root.hasAttribute("data-parallax");
    const native = progress && CSS.supports("animation-timeline: scroll()");
    const frame = () => {
      raf = 0;
      const y = scrollY;
      if (parallax) root.style.setProperty("--scroll", String(Math.round(y)));
      if (progress && !native) root.style.setProperty("--prog", String(Math.min(1, y / Math.max(1, html.scrollHeight - innerHeight))));
      if (nav && !still) root.toggleAttribute("data-stuck", y > 24);
      if (toTop) setTop(y > innerHeight * 1.2 && longPage());
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    frame();
    addEventListener("scroll", onScroll, { passive: true });
    const cleanup = () => {
      removeEventListener("scroll", onScroll); removeEventListener("resize", pad); cancelAnimationFrame(raf);
      html.style.scrollBehavior = ""; html.style.scrollPaddingTop = ""; root.removeAttribute("data-stuck");
    };
    if (still || !("IntersectionObserver" in window)) return cleanup;
    // Active section in the nav: the one crossing the upper-middle band of the screen.
    const links = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>(".ss-links a[href^='#']").forEach((a) => links.set(a.getAttribute("href")!.slice(1), a));
    const spy = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) links.forEach((a, id) => { if (id === e.target.id) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    }, { rootMargin: "-35% 0px -60% 0px" });
    links.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
    if (root.dataset.reveal === "none") return () => { spy.disconnect(); cleanup(); };
    // Grid children get an index the CSS turns into a stagger delay.
    root.querySelectorAll<HTMLElement>(".ss-sec").forEach((sec) => {
      sec.querySelectorAll<HTMLElement>(".ss-grid>*,.ss-points>li,.ss-faq>details,.ss-socials>*").forEach((c, i) => c.style.setProperty("--i", String(Math.min(i, 9))));
    });
    const secs = [...root.querySelectorAll<HTMLElement>(".ss-sec")];
    // Anything already on screen shows at once; only what's below the fold waits for the scroll.
    const below = secs.filter((el) => el.getBoundingClientRect().top > innerHeight * 0.9);
    secs.filter((el) => !below.includes(el)).forEach((el) => el.classList.add("ss-in"));
    below.forEach((el) => el.classList.add("ss-wait"));
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("ss-in"); e.target.classList.remove("ss-wait"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px" });
    below.forEach((el) => io.observe(el));
    return () => { io.disconnect(); spy.disconnect(); below.forEach((el) => el.classList.remove("ss-wait")); cleanup(); };
  }, [mode, toTop, progress, nav]);
  if (mode !== "live" || !top) return null;
  return (
    <button type="button" className="ss-top" aria-label="Back to top" onClick={() => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
      <ArrowUp size={18} />
    </button>
  );
}

// ---------- trades ----------

interface Trade { side: "buy" | "sell"; usd: number; who: string; at: number }

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** A made-up wallet for the showcase's trades. */
function demoWho(): string { return Array.from({ length: 44 }, () => B58[Math.floor(Math.random() * B58.length)]).join(""); }

export function LiveTrades({ token, mode }: { token: TokenInfo | null; mode: Mode }) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  useEffect(() => {
    if (!token?.pairAddress) return;
    if (token.demo) {
      const one = (at: number): Trade => ({ side: Math.random() < 0.62 ? "buy" : "sell", usd: Math.round(40 + Math.random() ** 2 * 4200), who: demoWho(), at });
      setTrades(Array.from({ length: 8 }, (_, i) => one(Date.now() - (i + 1) * 23_000)));
      if (mode !== "live") return;
      const h = setInterval(() => setTrades((x) => [one(Date.now()), ...(x ?? [])].slice(0, 8)), 2600);
      return () => clearInterval(h);
    }
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/trades?chain=${token.chain}&pool=${encodeURIComponent(token.pairAddress!)}`).catch(() => null);
      if (!stop && r?.ok) setTrades(((await r.json()) as { trades: Trade[] }).trades);
    };
    void tick();
    if (mode !== "live") return () => { stop = true; };
    const h = setInterval(tick, 12_000);
    return () => { stop = true; clearInterval(h); };
  }, [token?.chain, token?.pairAddress, token?.demo, mode]);

  if (!token?.pairAddress) return <div className="ss-card ss-muted">Trades show here once the token has a trading pair.</div>;
  if (!trades) return <div className="ss-card ss-muted">Loading trades…</div>;
  if (!trades.length) return <div className="ss-card ss-muted">No trades in the last while.</div>;
  return (
    <div className="ss-card" style={{ padding: "8px 16px" }}>
      <table className="ss-trades">
        <tbody>
          {trades.slice(0, 8).map((t, i) => (
            <tr key={`${t.at}-${t.who}`} className={token.demo && i === 0 ? "ss-row-in" : undefined}>
              <td className={t.side === "buy" ? "ss-up" : "ss-down"} style={{ fontWeight: 700, width: 60 }}>{t.side === "buy" ? "Buy" : "Sell"}</td>
              <td style={{ fontWeight: 700 }}>{usd(t.usd)}</td>
              <td className="ss-mono ss-muted">{short(t.who)}</td>
              <td className="ss-muted" style={{ textAlign: "right" }}>{ago(t.at)} ago</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- chart ----------

export function Chart({ token, mode, dark }: { token: TokenInfo | null; mode: Mode; dark: boolean }) {
  if (token?.demo) return <DemoChart token={token} mode={mode} />;
  if (!token?.pairAddress) return <div className="ss-chart"><div className="ss-chart-ph">The chart appears once the token has a trading pair.</div></div>;
  if (mode === "preview") {
    // A still in the preview: the live embed is heavy and animates. "Open live" shows the real one.
    return (
      <div className="ss-chart">
        <div className="ss-chart-ph">
          <svg viewBox="0 0 400 140" preserveAspectRatio="none" style={{ position: "absolute", inset: "20% 0 20%", width: "100%", height: "60%", opacity: 0.5 }} aria-hidden="true">
            <path d="M0 110 L40 96 L80 104 L120 70 L160 80 L200 52 L240 64 L280 30 L320 44 L360 18 L400 26" fill="none" stroke="var(--accent)" strokeWidth="3" />
          </svg>
          <span style={{ position: "relative" }}>Live DexScreener chart on the published site</span>
        </div>
      </div>
    );
  }
  // A pool only GeckoTerminal lists (a launchpad curve DexScreener doesn't index) has no DexScreener link: use its embed.
  if (!token.pairUrl) {
    const net = { ethereum: "eth", solana: "solana", near: "near", base: "base", bsc: "bsc", robinhood: "robinhood" }[token.chain];
    return <div className="ss-chart"><iframe src={`https://www.geckoterminal.com/${net}/pools/${token.pairAddress}?embed=1&info=0&swaps=0&light_chart=${dark ? 0 : 1}`} title={`${token.symbol} chart`} loading="lazy" /></div>;
  }
  const src = `https://dexscreener.com/${token.chain}/${token.pairAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=${dark ? "dark" : "light"}&theme=${dark ? "dark" : "light"}&chartStyle=1&chartType=usd&interval=15`;
  return <div className="ss-chart"><iframe src={src} title={`${token.symbol} chart`} loading="lazy" /></div>;
}

// ---------- buy ----------

interface PayOption { key: string; label: string; chain: string }
interface IntentQuote { depositAddress: string | null; amountIn: string; amountOut: string; amountOutUsd: string | null; timeEstimate: number | null; deliver: { symbol: string; direct: boolean }; dry: boolean; private?: boolean }

export function BuyBox({ chain, token, ticker }: { chain: Chain; token: TokenInfo | null; ticker: string }) {
  const [tab, setTab] = useState<"same" | "any">("same");
  const native = CHAINS[chain].native;
  return (
    <div className="ss-card ss-buy" data-el="buybox">
      <div className="ss-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "same"} onClick={() => setTab("same")}>With {native}</button>
        <button type="button" role="tab" aria-selected={tab === "any"} onClick={() => setTab("any")}><Globe2 size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />Any chain</button>
      </div>
      {tab === "same" ? <SameChain chain={chain} token={token} ticker={ticker} /> : <AnyChain chain={chain} token={token} ticker={ticker} />}
    </div>
  );
}

function SameChain({ chain, token, ticker }: { chain: Chain; token: TokenInfo | null; ticker: string }) {
  const { connected } = useWallets();
  const [amount, setAmount] = useState(chain === "solana" ? "0.1" : chain === "near" ? "1" : "0.01");
  const [q, setQ] = useState<{ out?: number; venue?: string; handoff?: string; impactPct?: number | null; swap?: boolean; error?: string } | null>(null);
  const [step, setStep] = useState<"idle" | "building" | "signing" | "sent">("idle");
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const native = CHAINS[chain].native;
  // Still on a launchpad curve: its own page is the way in when our router can't fill the curve (four.meme).
  const tv = token?.venue;
  const pad = venue(tv?.launchpad);
  const curveUrl = tv?.stage === "curve" ? tv.buyUrl : null;
  const viaPad = !!curveUrl && pad?.routable === false;

  useEffect(() => {
    if (!token || viaPad) return;
    const a = Number(amount);
    if (!(a > 0)) { setQ(null); return; }
    if (token.demo) {
      // Showcase token: a made-up quote from the moving demo price, nothing is asked of a router.
      const nativeUsd = chain === "solana" ? 160 : chain === "near" ? 3.2 : 3400;
      setQ(token.priceUsd ? { out: (a * nativeUsd) / token.priceUsd, venue: "sample quote", swap: false } : null);
      return;
    }
    const h = setTimeout(async () => {
      const acct = chain === "near" && connected?.wallet.kind === "near" ? `&account=${encodeURIComponent(connected.address)}` : "";
      const r = await fetch(`/api/quote?chain=${chain}&token=${encodeURIComponent(token.address)}&amount=${a}&decimals=${token.decimals ?? 6}${acct}`).catch(() => null);
      setQ(r ? await r.json() : { error: "No quote right now" });
    }, 350);
    return () => clearTimeout(h);
  }, [amount, chain, token, connected, viaPad]);

  if (!token) return <p className="ss-muted" style={{ margin: 0 }}>The buy box goes live once the site knows the token's contract address.</p>;
  const wantKind = chain === "solana" ? "solana" : chain === "near" ? "near" : "evm";
  const wrongWallet = connected && familyOf(connected.wallet) !== wantKind;
  const canSwap = !!q?.swap && !!connected && !wrongWallet;
  const fallback = venue(chain === "solana" ? "jupiter" : chain === "bsc" ? "pancakeswap" : chain === "near" ? null : "uniswap");
  const handoff = token.demo ? null : curveUrl ?? (fallback?.buy ? fallback.buy(token.address, chain) : `https://www.neartrade.lol/token/${encodeURIComponent(token.address)}`);
  const handoffName = curveUrl && pad ? pad.name : fallback?.name ?? "neartrade";

  async function buy() {
    if (!connected || !token) return;
    setErr(null);
    setTx(null);
    setStep("building");
    try {
      const r = await fetch("/api/swap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chain, token: token.address, amount: Number(amount), decimals: token.decimals ?? 6, user: connected.address }) });
      const b = (await r.json()) as BuiltTx & { error?: string };
      if (!r.ok || b.error) throw new Error(b.error || "Couldn't build the swap.");
      setStep("signing");
      const id = b.kind === "solana" ? await sendSolana(b.tx) : b.kind === "near" ? await sendNear(b.signerId, b.transactions) : await sendEvm(chain, b);
      setTx(id);
      setStep("sent");
    } catch (e) {
      const m = (e as { message?: string; code?: number }).message ?? "";
      setErr((e as { code?: number }).code === 4001 || /reject|denied|cancel/i.test(m) ? "You cancelled in the wallet." : m || "The swap didn't go through.");
      setStep("idle");
    }
  }

  return (
    <>
      <label className="ss-label" htmlFor="ss-amt">You pay ({native})</label>
      <input id="ss-amt" className="ss-input" inputMode="decimal" value={amount} disabled={step === "building" || step === "signing"} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setStep("idle"); setTx(null); }} />
      {q?.out != null && (
        <div className="ss-quote">
          You get about <b>{num(q.out)}</b> ${ticker}
          <div className="ss-note">Route: {q.venue}{q.impactPct != null ? ` · price impact ${q.impactPct.toFixed(2)}%` : ""}</div>
        </div>
      )}
      {q?.error && !curveUrl && <div className="ss-err">{q.error}</div>}
      {curveUrl && pad && !q?.swap && <div className="ss-note" style={{ marginTop: 10 }}>${ticker} is still on the {pad.name} bonding curve{tv?.progress != null ? ` (${Math.round(tv.progress * 100)}% sold)` : ""}: buy it there until it graduates.</div>}
      {step === "sent" && tx && (
        <div className="ss-quote" style={{ borderColor: "var(--accent)" }}>
          <Check size={15} style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} />Sent. <a href={explorerTx(chain, tx)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>View the transaction</a>
        </div>
      )}
      {err && <div className="ss-err">{err}</div>}
      {q?.swap && !connected && <div style={{ marginTop: 14 }}><WalletButton chain={chain} token={token} block /></div>}
      {canSwap && (
        <button type="button" className="ss-btn" style={{ width: "100%", marginTop: 14 }} disabled={step === "building" || step === "signing" || !(Number(amount) > 0) || q?.out == null} onClick={() => void buy()}>
          {step === "building" || step === "signing" ? <Loader2 size={16} className="ss-spin" /> : <ArrowRightLeft size={16} />}
          {step === "building" ? "Preparing…" : step === "signing" ? "Confirm in your wallet" : `Buy $${ticker}`}
        </button>
      )}
      {wrongWallet && <div className="ss-note" style={{ marginTop: 10 }}>Connect a {CHAINS[chain].name} wallet to buy here.</div>}
      {token.demo && (
        <button type="button" className="ss-btn" style={{ width: "100%", marginTop: 14 }} title="This is a sample site with a made-up token">
          <ArrowRightLeft size={16} /> Buy ${ticker}
        </button>
      )}
      {handoff && (
        <a className={q?.swap ? "ss-note" : "ss-btn"} style={q?.swap ? { display: "block", marginTop: 10, textAlign: "center", textDecoration: "underline" } : { width: "100%", marginTop: 14 }} href={handoff} target="_blank" rel="noreferrer">
          {!q?.swap && <ArrowRightLeft size={16} />} {q?.swap ? `Or buy on ${handoffName}` : `Buy $${ticker} on ${handoffName}`}
        </a>
      )}
    </>
  );
}

// "Any chain": two routes. NEAR Intents takes a deposit from any wallet on any chain it carries (Bitcoin included) and
// can run it privately (Confidential Intents); Relay is signed in the buyer's own EVM wallet and lands the token itself
// on EVM chains and Solana. NEAR sites only get NEAR Intents (Relay doesn't reach NEAR).
const RELAY_CHAINS: Chain[] = ["ethereum", "base", "bsc", "robinhood", "solana"];
const DEMO_USD: Record<string, number> = { ETH: 3400, SOL: 160, USDC: 1, USDT: 1, BNB: 600, BTC: 98000, NEAR: 3.2 };

function AnyChain({ chain, token, ticker }: { chain: Chain; token: TokenInfo | null; ticker: string }) {
  const relayOk = RELAY_CHAINS.includes(chain) && !!token;
  const [route, setRoute] = useState<"intents" | "relay">("intents");
  return (
    <>
      {relayOk && (
        <div className="ss-route" role="radiogroup" aria-label="Route">
          {([["intents", "NEAR Intents", "Any wallet, any chain"], ["relay", "Relay", "Sign in your wallet"]] as const).map(([k, name, sub]) => (
            <button key={k} type="button" role="radio" aria-checked={route === k} onClick={() => setRoute(k)}>
              <b>{name}</b><span>{sub}</span>
            </button>
          ))}
        </div>
      )}
      {route === "relay" && relayOk ? <RelayRoute chain={chain} token={token!} ticker={ticker} /> : <IntentsRoute chain={chain} token={token} ticker={ticker} />}
    </>
  );
}

function IntentsRoute({ chain, token, ticker }: { chain: Chain; token: TokenInfo | null; ticker: string }) {
  const { connected } = useWallets();
  const [pays, setPays] = useState<PayOption[]>([]);
  const [canPrivate, setCanPrivate] = useState(false);
  const [priv, setPriv] = useState(false);
  const [pay, setPay] = useState("eth:ETH");
  const [amount, setAmount] = useState("0.01");
  const [recipient, setRecipient] = useState("");
  const [refund, setRefund] = useState("");
  const [q, setQ] = useState<IntentQuote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (token?.demo) { setPays([{ key: "eth:ETH", label: "ETH", chain: "Ethereum" }, { key: "sol:SOL", label: "SOL", chain: "Solana" }, { key: "btc:BTC", label: "BTC", chain: "Bitcoin" }, { key: "base:USDC", label: "USDC", chain: "Base" }]); setCanPrivate(true); return; }
    void fetch("/api/intents").then((r) => r.json()).then((j: { payWith: PayOption[]; private?: boolean }) => { setPays(j.payWith); setCanPrivate(!!j.private); }).catch(() => undefined);
  }, [token?.demo]);
  useEffect(() => { if (connected && !recipient && familyOf(connected.wallet) === (chain === "solana" ? "solana" : chain === "near" ? "near" : "evm")) setRecipient(connected.address); }, [connected, recipient, chain]);

  // Dry quote as you type: shows what arrives without asking for addresses.
  useEffect(() => {
    const a = Number(amount);
    if (!(a > 0)) { setQ(null); return; }
    setErr(null);
    if (token?.demo) {
      const sym = pays.find((p) => p.key === pay)?.label ?? "ETH";
      const out = token.priceUsd ? (a * (DEMO_USD[sym] ?? 1) * 0.995) / token.priceUsd : null;
      setQ(out ? { depositAddress: null, amountIn: String(a), amountOut: num(out), amountOutUsd: String(a * (DEMO_USD[sym] ?? 1) * 0.995), timeEstimate: priv ? 40 : 20, deliver: { symbol: `$${ticker}`, direct: true }, dry: true, private: priv } : null);
      return;
    }
    const h = setTimeout(async () => {
      const r = await fetch("/api/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pay, amount: a, chain, token: token?.address ?? null, private: priv || undefined }) }).catch(() => null);
      const j = r ? await r.json() : { error: "No quote right now" };
      if ("error" in j) { setErr(j.error); setQ(null); } else setQ(j);
    }, 450);
    return () => clearTimeout(h);
  }, [pay, amount, chain, token?.address, token?.demo, token?.priceUsd, priv, pays, ticker]);

  useEffect(() => {
    if (!q?.depositAddress || q.dry) return;
    const h = setInterval(async () => {
      const r = await fetch(`/api/intents/status?depositAddress=${encodeURIComponent(q.depositAddress!)}`).catch(() => null);
      if (r?.ok) setStatus(((await r.json()) as { status?: string }).status ?? null);
    }, 6000);
    return () => clearInterval(h);
  }, [q?.depositAddress, q?.dry]);

  async function getDeposit() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pay, amount: Number(amount), chain, token: token?.address ?? null, recipient: recipient.trim(), refundTo: refund.trim(), private: priv || undefined }) }).catch(() => null);
    const j = r ? await r.json() : { error: "No quote right now" };
    setBusy(false);
    if ("error" in j) setErr(j.error); else setQ(j);
  }

  const payLabel = pays.find((p) => p.key === pay);
  const live = q && !q.dry && q.depositAddress;
  return (
    <>
      <label className="ss-label" htmlFor="ss-pay">Pay with</label>
      <div className="ss-row">
        <select id="ss-pay" className="ss-select" value={pay} onChange={(e) => setPay(e.target.value)} disabled={!!live}>
          {(pays.length ? pays : [{ key: "eth:ETH", label: "ETH", chain: "Ethereum" }]).map((p) => <option key={p.key} value={p.key}>{p.label} on {p.chain}</option>)}
        </select>
        <input className="ss-input" inputMode="decimal" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} disabled={!!live} />
      </div>
      {canPrivate && (
        <button type="button" role="switch" aria-checked={priv} className="ss-private" disabled={!!live} onClick={() => setPriv((v) => !v)}>
          <span className="ss-switch" aria-hidden><i /></span>
          <span><b><Shield size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 5 }} />Private buy</b><span className="ss-note" style={{ display: "block", marginTop: 2 }}>Runs through Confidential Intents, so the paying address and your {CHAINS[chain].name} wallet aren&apos;t linked on chain.</span></span>
        </button>
      )}
      {q && (
        <div className="ss-quote">
          Arrives as <b>{q.amountOut}</b> {q.deliver.symbol}{q.amountOutUsd ? <span className="ss-muted"> (≈ ${Number(q.amountOutUsd).toFixed(2)})</span> : null}
          <div className="ss-note">
            {q.deliver.direct ? `Delivered straight to your ${CHAINS[chain].name} wallet.` : `Delivered as ${q.deliver.symbol} on ${CHAINS[chain].name}; swap it for $${ticker} in the other tab.`}
            {q.timeEstimate ? ` About ${q.timeEstimate < 90 ? `${Math.max(5, Math.round(q.timeEstimate / 5) * 5)} s` : `${Math.round(q.timeEstimate / 60)} min`}.` : ""} {q.private ? "Private, routed by NEAR Intents." : "Routed by NEAR Intents."}
          </div>
        </div>
      )}
      {!live && (
        <>
          <label className="ss-label" htmlFor="ss-to">Your {CHAINS[chain].name} address</label>
          <input id="ss-to" className="ss-input ss-mono" style={{ fontSize: 13 }} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={connected ? "" : "Connect a wallet or paste an address"} />
          <label className="ss-label" htmlFor="ss-refund">Refund address on {payLabel?.chain ?? "the paying chain"}</label>
          <input id="ss-refund" className="ss-input ss-mono" style={{ fontSize: 13 }} value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="Where funds go back if the swap can't fill" />
          <button type="button" className="ss-btn" style={{ width: "100%", marginTop: 14 }} disabled={busy || !q || !recipient.trim() || !refund.trim() || !!token?.demo} title={token?.demo ? "This is a sample site with a made-up token" : undefined} onClick={() => void getDeposit()}>
            {priv ? <Shield size={16} /> : <Globe2 size={16} />} {busy ? "Getting address…" : priv ? "Get private deposit address" : "Get deposit address"}
          </button>
        </>
      )}
      {live && (
        <div className="ss-quote" style={{ borderColor: "var(--accent)" }}>
          Send exactly <b>{q.amountIn} {payLabel?.label}</b> on {payLabel?.chain} to:
          <div style={{ marginTop: 10 }}><CopyCA address={q.depositAddress!} /></div>
          <div className="ss-note">Status: {status ?? "waiting for your deposit"}. This address is for this quote only.</div>
        </div>
      )}
      {err && <div className="ss-err">{err}</div>}
    </>
  );
}

interface RelayQ { requestId: string | null; amountOut: string; amountOutUsd: string | null; symbol: string; impactPct: number | null; timeEstimate: number | null; feesUsd: number | null; txs: Array<{ to: string; data: string; value: string; chainId: number; gas: string | null }>; walletChain: Chain }
const RELAY_PAYS: PayOption[] = [
  { key: "eth:ETH", label: "ETH", chain: "Ethereum" }, { key: "base:ETH", label: "ETH", chain: "Base" }, { key: "base:USDC", label: "USDC", chain: "Base" },
  { key: "eth:USDC", label: "USDC", chain: "Ethereum" }, { key: "bsc:BNB", label: "BNB", chain: "BNB Chain" },
];
const hex = (v: string | null) => (v == null ? null : v.startsWith("0x") ? v : `0x${BigInt(v || "0").toString(16)}`);

function RelayRoute({ chain, token, ticker }: { chain: Chain; token: TokenInfo; ticker: string }) {
  const { connected } = useWallets();
  const [pay, setPay] = useState(chain === "bsc" ? "bsc:BNB" : chain === "base" ? "base:ETH" : "eth:ETH");
  const [amount, setAmount] = useState("0.01");
  const [recipient, setRecipient] = useState("");
  const [q, setQ] = useState<RelayQ | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "quoting" | "signing" | "sent">("idle");
  const [n, setN] = useState<{ at: number; of: number } | null>(null);
  const [tx, setTx] = useState<{ hash: string; chain: Chain } | null>(null);
  const [status, setStatus] = useState<{ text: string | null; done: boolean; failed: boolean } | null>(null);
  const evmOn = connected && familyOf(connected.wallet) === "evm";
  const sameFamily = chain !== "solana";

  useEffect(() => { if (connected && !recipient && familyOf(connected.wallet) === (chain === "solana" ? "solana" : "evm")) setRecipient(connected.address); }, [connected, recipient, chain]);

  useEffect(() => {
    const a = Number(amount);
    if (!(a > 0) || step === "signing" || step === "sent") { if (!(a > 0)) setQ(null); return; }
    setErr(null);
    if (token.demo) {
      const sym = RELAY_PAYS.find((p) => p.key === pay)?.label ?? "ETH";
      const usdIn = a * (DEMO_USD[sym] ?? 1);
      setQ(token.priceUsd ? { requestId: null, amountOut: num((usdIn * 0.993) / token.priceUsd), amountOutUsd: String(usdIn * 0.993), symbol: ticker, impactPct: -0.7, timeEstimate: 4, feesUsd: usdIn * 0.004, txs: [], walletChain: "ethereum" } : null);
      return;
    }
    const h = setTimeout(async () => {
      const r = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pay, amount: a, chain, token: token.address }) }).catch(() => null);
      const j = r ? await r.json() : { error: "No quote right now" };
      if ("error" in j) { setErr(j.error); setQ(null); } else setQ(j);
    }, 450);
    return () => clearTimeout(h);
  }, [pay, amount, chain, token.address, token.demo, token.priceUsd, ticker, step]);

  useEffect(() => {
    if (step !== "sent" || !q?.requestId || status?.done || status?.failed) return;
    const h = setInterval(async () => {
      const r = await fetch(`/api/relay/status?id=${q.requestId}`).catch(() => null);
      if (!r?.ok) return;
      const j = (await r.json()) as { status?: string | null; done?: boolean; failed?: boolean };
      setStatus({ text: j.status ?? null, done: !!j.done, failed: !!j.failed });
    }, 4000);
    return () => clearInterval(h);
  }, [step, q?.requestId, status?.done, status?.failed]);

  async function buy() {
    if (!evmOn || !connected) return;
    setErr(null);
    setStep("quoting");
    try {
      // A fresh quote for this wallet: Relay's transactions are made for the exact sender and recipient.
      const r = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pay, amount: Number(amount), chain, token: token.address, user: connected.address, recipient: recipient.trim() }) });
      const j = (await r.json()) as RelayQ & { error?: string };
      if (!r.ok || j.error || !j.txs.length) throw new Error(j.error || "Relay didn't return a route for this wallet.");
      setQ(j);
      setStep("signing");
      let last = "";
      for (let i = 0; i < j.txs.length; i++) {
        setN({ at: i + 1, of: j.txs.length });
        const t = j.txs[i];
        last = await sendEvm(j.walletChain, { to: t.to, data: t.data, value: hex(t.value)!, gas: hex(t.gas) });
        // An approval has to land before the deposit that spends it.
        if (i < j.txs.length - 1 && !(await waitEvm(last))) throw new Error("The approval didn't go through.");
      }
      setTx({ hash: last, chain: j.walletChain });
      setStatus({ text: "on its way", done: false, failed: false });
      setStep("sent");
    } catch (e) {
      const m = (e as { message?: string }).message ?? "";
      setErr((e as { code?: number }).code === 4001 || /reject|denied|cancel/i.test(m) ? "You cancelled in the wallet." : m || "The buy didn't go through.");
      setStep("idle");
    } finally {
      setN(null);
    }
  }

  const payLabel = RELAY_PAYS.find((p) => p.key === pay);
  const locked = step === "quoting" || step === "signing" || step === "sent";
  return (
    <>
      <label className="ss-label" htmlFor="ss-rpay">Pay with</label>
      <div className="ss-row">
        <select id="ss-rpay" className="ss-select" value={pay} onChange={(e) => setPay(e.target.value)} disabled={locked}>
          {RELAY_PAYS.map((p) => <option key={p.key} value={p.key}>{p.label} on {p.chain}</option>)}
        </select>
        <input className="ss-input" inputMode="decimal" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} disabled={locked} />
      </div>
      {q && (
        <div className="ss-quote">
          You get about <b>{q.amountOut}</b> ${ticker}{q.amountOutUsd ? <span className="ss-muted"> (≈ ${Number(q.amountOutUsd).toFixed(2)})</span> : null}
          <div className="ss-note">
            Straight to your {CHAINS[chain].name} wallet{q.timeEstimate ? `, about ${Math.max(2, q.timeEstimate)} s` : ""}.
            {q.feesUsd ? ` Fees ≈ $${q.feesUsd.toFixed(2)}.` : ""}{q.impactPct != null && q.impactPct <= -0.1 ? ` Price impact ${Math.abs(q.impactPct).toFixed(2)}%.` : ""} Routed by Relay.
          </div>
        </div>
      )}
      {!sameFamily && step !== "sent" && (
        <>
          <label className="ss-label" htmlFor="ss-rto">Your Solana address</label>
          <input id="ss-rto" className="ss-input ss-mono" style={{ fontSize: 13 }} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Where the tokens land" />
        </>
      )}
      {step === "sent" && tx ? (
        <div className="ss-quote" style={{ borderColor: "var(--accent)" }}>
          {status?.done ? <Check size={15} style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} /> : <Loader2 size={15} className="ss-spin" style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} />}
          {status?.done ? `Done, $${ticker} is in your wallet.` : `Sent. ${status?.text ? `Status: ${status.text}.` : ""}`}{" "}
          <a href={explorerTx(tx.chain, tx.hash)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>View the transaction</a>
        </div>
      ) : token.demo ? (
        <button type="button" className="ss-btn" style={{ width: "100%", marginTop: 14 }} title="This is a sample site with a made-up token"><ArrowRightLeft size={16} /> Buy ${ticker} with {payLabel?.label}</button>
      ) : !evmOn ? (
        <div style={{ marginTop: 14 }}>
          <WalletButton chain={q?.walletChain ?? "ethereum"} token={token} block />
          <div className="ss-note" style={{ marginTop: 8 }}>Connect the wallet that holds your {payLabel?.label} on {payLabel?.chain}.</div>
        </div>
      ) : (
        <button type="button" className="ss-btn" style={{ width: "100%", marginTop: 14 }} disabled={locked || !q || !(Number(amount) > 0) || !recipient.trim()} onClick={() => void buy()}>
          {locked ? <Loader2 size={16} className="ss-spin" /> : <ArrowRightLeft size={16} />}
          {step === "quoting" ? "Preparing…" : step === "signing" ? `Confirm in your wallet${n && n.of > 1 ? ` (${n.at} of ${n.of})` : ""}` : `Buy $${ticker} with ${payLabel?.label}`}
        </button>
      )}
      {err && <div className="ss-err">{err}</div>}
    </>
  );
}

// ---------- showcase chart ----------

/** The showcase's chart: a seeded random walk drawn as an area, with a new candle every couple of seconds on live pages. */
function DemoChart({ token, mode }: { token: TokenInfo; mode: Mode }) {
  const N = 72;
  const [pts, setPts] = useState<number[]>(() => {
    let seed = [...token.symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const out = [50];
    for (let i = 1; i < N; i++) out.push(Math.max(8, Math.min(92, out[i - 1] + (rnd() - 0.42) * 7)));
    return out;
  });
  useEffect(() => {
    if (mode !== "live") return;
    const h = setInterval(() => setPts((p) => [...p.slice(1), Math.max(8, Math.min(92, p[p.length - 1] + (Math.random() - 0.45) * 6))]), 2400);
    return () => clearInterval(h);
  }, [mode]);
  const x = (i: number) => (i / (N - 1)) * 400;
  const y = (v: number) => 150 - (v / 100) * 140;
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const up = last >= pts[0];
  return (
    <div className="ss-chart ss-demo-chart" data-el="chart">
      <div className="ss-demo-chart-head">
        <b>${token.symbol}</b><span className="ss-muted">/ USD · 15m</span>
        <span className={up ? "ss-up" : "ss-down"} style={{ marginLeft: "auto" }}>{usd(token.priceUsd)}</span>
      </div>
      <svg viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={`ssg-${token.symbol}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".32" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {[40, 80, 120].map((g) => <line key={g} x1="0" x2="400" y1={g} y2={g} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={`${line} L400 160 L0 160 Z`} fill={`url(#ssg-${token.symbol})`} />
        <path className="ss-demo-line" d={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={x(N - 1)} cy={y(last)} r="3.5" fill="var(--accent)" className="ss-demo-dot" />
      </svg>
    </div>
  );
}
