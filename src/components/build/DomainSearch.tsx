"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Loader2, Search, ShoppingCart } from "lucide-react";
import { BRANDS, BrandIcon } from "@/components/brand";
import { Switch } from "@/components/settings/KeyRow";
import { BuyPanel } from "./DomainBuy";

// The full domain search page: every extension we list, plus name ideas, filtered and sorted here in the browser the
// way registrars do it (extension groups, price ceiling, available only, premium, sort). Server: /api/domains/search?wide=1.

type Offer = { domain: string; tld: string; idea: boolean; available: boolean; premium: boolean; price: number | null; total: number | null; renew: number | null };
type Res = { enabled: boolean; buying: boolean; offers: Offer[]; groups: Record<string, string[]>; error?: string };
type Sort = "best" | "low" | "high" | "short" | "az";

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
const spaceshipSearch = (q: string) => `https://www.spaceship.com/domain-search/?query=${encodeURIComponent(q)}`;
const PRICES = [0, 10, 20, 50, 100];
const PAGE = 20;

export function DomainSearch({ initial, projectId }: { initial: string; projectId: string | null }) {
  const [q, setQ] = useState(initial);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"names" | "ideas">("names");
  const [groups, setGroups] = useState<string[]>([]);
  const [tld, setTld] = useState("");
  const [maxPrice, setMaxPrice] = useState(0);
  const [onlyFree, setOnlyFree] = useState(true);
  const [premium, setPremium] = useState(true);
  const [sort, setSort] = useState<Sort>("best");
  const [shown, setShown] = useState(PAGE);
  const [buying, setBuying] = useState<Offer | null>(null);
  const [live, setLive] = useState(false);

  async function search(term = q) {
    if (term.trim().length < 2) return;
    setBusy(true);
    const j = (await fetch(`/api/domains/search?wide=1&q=${encodeURIComponent(term.trim())}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as Res | null;
    setRes(j ?? { enabled: false, buying: false, offers: [], groups: {}, error: "Couldn't search right now." });
    setBusy(false);
    try { const u = new URL(location.href); u.searchParams.set("q", term.trim()); history.replaceState(null, "", u); } catch { /* fine */ }
  }
  useEffect(() => { if (initial) void search(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [tab, groups, tld, maxPrice, onlyFree, premium, sort, res]);

  const order = useMemo(() => new Map(Object.values(res?.groups ?? {}).flat().map((t, i) => [t, i])), [res]);
  const inGroups = useMemo(() => new Set(groups.flatMap((g) => res?.groups[g] ?? [])), [groups, res]);
  const list = useMemo(() => {
    const t = tld.trim().replace(/^\./, "").toLowerCase();
    const out = (res?.offers ?? []).filter((o) => {
      if (o.idea !== (tab === "ideas")) return false;
      if (onlyFree && !o.available) return false;
      if (!premium && o.premium) return false;
      if (maxPrice && (o.total == null || o.total > maxPrice)) return false;
      if (inGroups.size && !inGroups.has(o.tld)) return false;
      if (t && !o.tld.startsWith(t)) return false;
      return true;
    });
    const price = (o: Offer) => o.total ?? 1e9;
    const cmp: Record<Sort, (a: Offer, b: Offer) => number> = {
      best: (a, b) => Number(b.available) - Number(a.available) || (order.get(a.tld) ?? 999) - (order.get(b.tld) ?? 999) || price(a) - price(b),
      low: (a, b) => price(a) - price(b),
      high: (a, b) => (b.total ?? -1) - (a.total ?? -1),
      short: (a, b) => a.domain.length - b.domain.length || price(a) - price(b),
      az: (a, b) => a.domain.localeCompare(b.domain),
    };
    return out.sort(cmp[sort]);
  }, [res, tab, onlyFree, premium, maxPrice, inGroups, tld, sort, order]);

  const counts = useMemo(() => ({ names: (res?.offers ?? []).filter((o) => !o.idea && o.available).length, ideas: (res?.offers ?? []).filter((o) => o.idea && o.available).length }), [res]);

  if (buying && projectId) {
    return (
      <div className="mt-6 max-w-[560px] rounded-[14px] border border-white/[0.08] bg-ink-900 p-4">
        {live ? <p className="flex items-center gap-2 text-[13px] text-lime"><Check size={14} /> {buying.domain} is yours and pointing at your site. Close this tab and check the Publish dialog.</p>
          : <BuyPanel projectId={projectId} offer={buying} onBack={() => setBuying(null)} onLive={() => setLive(true)} />}
      </div>
    );
  }

  return (
    <div className="mt-6 min-w-0 space-y-4">
      <form className="flex min-w-0 items-center gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-3.5 focus-within:border-sel/60">
          <Search size={15} className="shrink-0 text-zinc-500" />
          <input className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-white outline-none" placeholder="yourtoken, or several: batman, batcoin" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search domains" autoFocus />
        </div>
        <button type="submit" className="btn btn-primary h-11 px-4" disabled={busy || q.trim().length < 2}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search</button>
      </form>

      {res && !res.enabled && (
        <p className="text-[13px] text-zinc-500">Domain search isn&apos;t switched on here yet. <a className="text-zinc-300 underline-offset-2 hover:underline" href={spaceshipSearch(q)} target="_blank" rel="noreferrer">Search on Spaceship</a> instead.</p>
      )}
      {res?.error && res.enabled && <p className="text-[13px] text-amber-300">{res.error}</p>}

      {res?.enabled && (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4 rounded-[14px] border border-white/[0.07] bg-ink-900 p-4 md:self-start">
            <div>
              <p className="mb-2 text-[11.5px] font-medium text-zinc-400">Extensions</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(res.groups).map((g) => {
                  const on = groups.includes(g);
                  return (
                    <button key={g} type="button" aria-pressed={on} onClick={() => setGroups((x) => (on ? x.filter((y) => y !== g) : [...x, g]))}
                      className={`h-7 rounded-[8px] border px-2 text-[12px] ${on ? "border-sel/50 bg-sel/15 text-white" : "border-white/[0.08] text-zinc-400 hover:text-zinc-200"}`}>{g}</button>
                  );
                })}
              </div>
              <input className="field mt-2 h-8 w-full font-mono text-[12.5px]" placeholder=".com, .xyz…" value={tld} onChange={(e) => setTld(e.target.value)} aria-label="Filter by extension" />
            </div>
            <div>
              <p className="mb-2 text-[11.5px] font-medium text-zinc-400">Price per year</p>
              <div className="flex flex-wrap gap-1.5">
                {PRICES.map((p) => (
                  <button key={p} type="button" aria-pressed={maxPrice === p} onClick={() => setMaxPrice(p)}
                    className={`h-7 rounded-[8px] border px-2 text-[12px] ${maxPrice === p ? "border-sel/50 bg-sel/15 text-white" : "border-white/[0.08] text-zinc-400 hover:text-zinc-200"}`}>{p ? `Under $${p}` : "Any"}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-zinc-300">Available only <Switch on={onlyFree} onChange={setOnlyFree} label="Available only" /></label>
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-zinc-300">Show premium names <Switch on={premium} onChange={setPremium} label="Show premium names" /></label>
          </aside>

          <section className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1" role="tablist">
                {([["names", "Your names", counts.names], ["ideas", "Name ideas", counts.ideas]] as const).map(([id, label, n]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                    className={`h-8 rounded-[9px] border px-3 text-[12.5px] ${tab === id ? "border-white/15 bg-white/[0.09] text-white" : "border-white/[0.07] text-zinc-400 hover:text-zinc-200"}`}>{label} <span className="text-zinc-500">{n}</span></button>
                ))}
              </div>
              <select className="ml-auto h-8 rounded-[9px] border border-white/[0.08] bg-ink-900 px-2 text-[12.5px] text-zinc-300" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
                <option value="best">Best match</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
                <option value="short">Shortest first</option>
                <option value="az">A to Z</option>
              </select>
            </div>
            {busy && <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-400"><Loader2 size={14} className="animate-spin" /> Checking every extension…</div>}
            {!busy && list.length === 0 && <p className="py-6 text-[13px] text-zinc-500">Nothing matches these filters. Loosen one, or try another name.</p>}
            {!busy && list.length > 0 && (
              <div className="overflow-hidden rounded-[12px] border border-white/[0.07]">
                {list.slice(0, shown).map((o) => (
                  <div key={o.domain} className="flex min-w-0 items-center gap-3 border-t border-white/[0.06] px-3 py-2.5 first:border-t-0">
                    <span className={`min-w-0 flex-1 truncate font-mono text-[13px] ${o.available ? "text-zinc-100" : "text-zinc-500 line-through"}`}>{o.domain}</span>
                    {o.premium && o.available && <span className="text-[11px] text-amber-300">premium</span>}
                    {o.available && o.total != null ? (
                      <>
                        <span className="text-right text-[12.5px] text-zinc-200">{money(o.total)}<span className="text-zinc-500"> /yr</span>{o.renew != null && o.renew !== o.price && <span className="hidden text-[11px] text-zinc-500 sm:block">renews {money(o.renew)}</span>}</span>
                        {res.buying && projectId ? (
                          <button type="button" className="btn btn-outline h-8 px-2.5 text-[12px]" onClick={() => setBuying(o)}><ShoppingCart size={13} /> Buy</button>
                        ) : (
                          <a className="btn btn-ghost h-8 px-2.5 text-[12px]" href={spaceshipSearch(o.domain)} target="_blank" rel="noreferrer">On Spaceship <ArrowUpRight size={12} /></a>
                        )}
                      </>
                    ) : <span className="text-[11.5px] text-zinc-500">taken</span>}
                  </div>
                ))}
                {list.length > shown && (
                  <button type="button" className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-white/[0.06] text-[12.5px] text-zinc-300 hover:bg-white/[0.04] hover:text-white" onClick={() => setShown((n) => n + PAGE)}>
                    <ChevronDown size={13} /> Show more ({list.length - shown})
                  </button>
                )}
              </div>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-zinc-500"><BrandIcon icon={BRANDS.spaceship} size={11} /> Registered through Spaceship with WHOIS privacy. Prices include our fee.</p>
          </section>
        </div>
      )}
    </div>
  );
}
