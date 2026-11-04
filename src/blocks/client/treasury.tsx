"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { BrandIcon, BRANDS } from "@/components/brand";
import type { TreasuryAccount, TreasuryData } from "@/lib/treasury";
import { num, usd } from "../format";
import type { Mode } from "./parts";

// The treasury block. The snapshot (read when the site was built or edited) renders first, on the server too, so
// the page never loads empty; a live page then refreshes it from /api/treasury (cached 60s) once a minute.

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const shortName = (a: string) => (a.length > 24 ? `${a.slice(0, 10)}...${a.slice(-8)}` : a);
const NB = "https://nearblocks.io";

function Row({ href, left, mid, right }: { href: string; left: React.ReactNode; mid: React.ReactNode; right: React.ReactNode }) {
  return (
    <a className="ss-tr-row" href={href} target="_blank" rel="noreferrer">
      <span className="ss-tr-l">{left}</span><span className="ss-tr-m">{mid}</span><span className="ss-tr-r">{right}</span>
    </a>
  );
}

function Coin({ logo, symbol }: { logo: string | null; symbol: string }) {
  return logo ? <img className="ss-tr-coin" src={logo} alt="" width={28} height={28} loading="lazy" /> : <span className="ss-tr-coin ss-tr-coin-i">{symbol.slice(0, 1)}</span>;
}

function Account({ a }: { a: TreasuryAccount }) {
  if (a.error) return <div className="ss-card ss-muted" data-el="treasury">{a.error}: <a className="ss-tr-link" href={a.url} target="_blank" rel="noreferrer">{shortName(a.account)}</a></div>;
  const d = a.dao;
  return (
    <div className="ss-tr-acc" data-el="treasury">
      <div className="ss-grid ss-g4">
        <a className="ss-card ss-stat" href={a.url} target="_blank" rel="noreferrer"><div className="k">Total value</div><div className="v">{usd(a.totalUsd)}</div></a>
        <a className="ss-card ss-stat" href={`${a.url}#tokens`} target="_blank" rel="noreferrer"><div className="k">Assets held</div><div className="v">{a.holdings.length}</div></a>
        {d && <a className="ss-card ss-stat" href={a.url} target="_blank" rel="noreferrer"><div className="k">Council</div><div className="v">{d.members}</div></a>}
        {d && <a className="ss-card ss-stat" href={a.url} target="_blank" rel="noreferrer"><div className="k">To approve a payment</div><div className="v">{d.need ? `${d.need} of ${d.members}` : "Per policy"}</div></a>}
      </div>
      <div className="ss-grid ss-g2 ss-tr-cols">
        <div className="ss-card">
          <h3 className="ss-tr-h">Holdings</h3>
          {a.holdings.length ? a.holdings.slice(0, 12).map((h) => (
            <Row key={h.id} href={h.url}
              left={h.kind === "native" || h.kind === "staked" ? <span className="ss-tr-coin ss-tr-coin-i"><BrandIcon icon={BRANDS.near} size={16} color="currentColor" /></span> : <Coin logo={h.logo} symbol={h.symbol} />}
              mid={<><b>{h.symbol}</b><span className="ss-muted">{h.kind === "ft" ? h.name : h.kind === "native" ? "Available" : h.name}</span></>}
              right={<><b>{h.usd != null ? usd(h.usd) : "—"}</b><span className="ss-muted">{num(h.amount)}</span></>} />
          )) : <p className="ss-muted ss-tr-empty">No assets yet.</p>}
          {a.unpriced > 0 && <p className="ss-muted ss-tr-note">{a.unpriced} more token{a.unpriced > 1 ? "s" : ""} with no market price, not counted.</p>}
        </div>
        <div className="ss-card">
          <h3 className="ss-tr-h">Recent transfers</h3>
          {a.transfers.length ? a.transfers.map((t, i) => (
            <Row key={i} href={t.url}
              left={t.dir === "in" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              mid={<><b>{t.dir === "in" ? "Received" : "Sent"} {num(t.amount)} {t.symbol}</b><span className="ss-muted">{t.dir === "in" ? "from" : "to"} {shortName(t.peer)}</span></>}
              right={<><b>{t.usd != null ? usd(t.usd) : ""}</b><span className="ss-muted">{day(t.at)}</span></>} />
          )) : <p className="ss-muted ss-tr-empty">No transfers found.</p>}
        </div>
      </div>
      {d && (
        <div className="ss-card">
          <h3 className="ss-tr-h">Latest proposals{d.count ? ` (${d.count} in total)` : ""}</h3>
          {d.proposals.length ? d.proposals.map((p) => (
            <Row key={p.id} href={p.url}
              left={<span className="ss-tr-id">#{p.id}</span>}
              mid={<><b>{p.title}</b><span className="ss-muted">{p.kind}{p.amount ? ` · ${p.amount}` : ""} · {day(p.at)}</span></>}
              right={<span className="ss-tr-status" data-s={p.status.toLowerCase()}>{p.status}</span>} />
          )) : <p className="ss-muted ss-tr-empty">No proposals yet.</p>}
        </div>
      )}
    </div>
  );
}

export function Treasury({ accounts, snapshot, mode }: { accounts: string[]; snapshot: TreasuryData | null; mode: Mode }) {
  const key = accounts.join(",");
  const [data, setData] = useState(snapshot);
  const [failed, setFailed] = useState(false);
  useEffect(() => setData(snapshot), [snapshot]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/treasury?accounts=${encodeURIComponent(key)}`).catch(() => null);
      if (stop) return;
      if (r?.ok) { setData((await r.json()) as TreasuryData); setFailed(false); } else setFailed(true);
    };
    // The builder only reads when there is nothing cached; a live page reads at once, then every minute.
    if (mode === "live" || !snapshot) void tick();
    if (mode !== "live") return () => { stop = true; };
    const h = setInterval(tick, 60_000);
    return () => { stop = true; clearInterval(h); };
  }, [key, mode, snapshot]);

  if (!data) return <div className="ss-card ss-muted">{failed ? "Couldn't read the treasury right now. " : "Reading the treasury... "}{accounts.map((a) => <a key={a} className="ss-tr-link" href={`${NB}/address/${a}`} target="_blank" rel="noreferrer">{a} </a>)}</div>;
  return (
    <div className="ss-tr" data-multi={data.accounts.length > 1 ? "" : undefined}>
      {data.accounts.map((a) => (
        <div key={a.account}>
          <div className="ss-tr-head">
            <a className="ss-mono ss-tr-name" href={a.url} target="_blank" rel="noreferrer" title={a.account}>{a.account}</a>
            <span className="ss-muted">{a.kind === "dao" ? "Sputnik DAO" : "NEAR account"}</span>
          </div>
          <Account a={a} />
        </div>
      ))}
      <p className="ss-src">Read from the NEAR blockchain, prices from DexScreener, history from NearBlocks. Every figure links to the explorer.{failed ? " Showing the last saved reading." : ""}</p>
    </div>
  );
}
