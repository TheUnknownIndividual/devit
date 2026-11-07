"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, CheckCircle2, Copy, Loader2, Search, ShoppingCart, Wand2 } from "lucide-react";
import { BRANDS, BrandIcon } from "@/components/brand";

// Buying a domain from the Publish dialog (Spaceship, paid with any token through NEAR Intents), and writing the DNS
// records for a domain the team already has on Spaceship. Server side: /api/domains/search,
// /api/projects/<id>/domain/buy and /api/projects/<id>/domain/spaceship.

type Offer = { domain: string; available: boolean; premium: boolean; price: number | null; total: number | null; renew: number | null };
type Search = { enabled: boolean; buying: boolean; fee?: number; offers: Offer[]; error?: string };
type Quote = { depositAddress: string; amountIn: string; symbol: string; chain: string; usd: number; domain: string };
type Order = { depositAddress: string; domain: string; usd: number; state: "awaiting" | "paid" | "registering" | "live" | "refund" | "closed"; status: string | null; received: number | null; error: string | null; waiting: boolean };

const spaceshipSearch = (q: string) => `https://www.spaceship.com/domain-search/?query=${encodeURIComponent(q)}`;
const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

export function DomainBuy({ projectId, suggest, onLive }: { projectId: string; suggest: string; onLive: () => void }) {
  const [q, setQ] = useState(suggest);
  const [s, setS] = useState<Search | null>(null);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState<Offer | null>(null);

  async function search(term = q) {
    setBusy(true);
    const j = (await fetch(`/api/domains/search?q=${encodeURIComponent(term.trim())}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as Search | null;
    setS(j ?? { enabled: false, buying: false, offers: [], error: "Couldn't search right now." });
    setBusy(false);
  }
  useEffect(() => { if (suggest) void search(suggest); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (buying) return <BuyPanel projectId={projectId} offer={buying} onBack={() => setBuying(null)} onLive={onLive} />;

  return (
    <div className="space-y-2.5">
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 focus-within:border-sel/60">
          <Search size={14} className="shrink-0 text-zinc-500" />
          <input className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-white outline-none" placeholder="yourtoken" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search domains" />
        </div>
        <button type="submit" className="btn btn-outline" disabled={busy || q.trim().length < 2}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Search</button>
      </form>

      {s && !s.enabled && (
        <p className="text-[12px] text-zinc-500">
          Domain search isn&apos;t switched on here yet. <a className="text-zinc-300 underline-offset-2 hover:underline" href={spaceshipSearch(q || suggest)} target="_blank" rel="noreferrer">Search on Spaceship</a>, then connect it under &ldquo;I have a domain&rdquo;.
        </p>
      )}
      {s?.error && s.enabled && <p className="text-[12px] text-amber-300">{s.error}</p>}
      {s?.enabled && s.offers.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-white/[0.07]">
          {s.offers.map((o) => (
            <div key={o.domain} className="flex items-center gap-3 border-t border-white/[0.06] px-3 py-2 first:border-t-0">
              <span className={`min-w-0 flex-1 truncate font-mono text-[12.5px] ${o.available ? "text-zinc-100" : "text-zinc-500 line-through"}`}>{o.domain}</span>
              {o.premium && o.available && <span className="text-[11px] text-amber-300">premium</span>}
              {o.available && o.total != null ? (
                <>
                  <span className="text-right text-[12px] text-zinc-300">{money(o.total)}<span className="text-zinc-500"> /yr</span></span>
                  {s.buying ? (
                    <button type="button" className="btn btn-outline h-7 px-2.5 text-[12px]" onClick={() => setBuying(o)}><ShoppingCart size={13} /> Buy</button>
                  ) : (
                    <a className="btn btn-ghost h-7 px-2.5 text-[12px]" href={spaceshipSearch(o.domain)} target="_blank" rel="noreferrer">On Spaceship <ArrowUpRight size={12} /></a>
                  )}
                </>
              ) : <span className="text-[11.5px] text-zinc-500">taken</span>}
            </div>
          ))}
        </div>
      )}
      {s?.enabled && (
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <BrandIcon icon={BRANDS.spaceship} size={11} /> Registered through Spaceship with WHOIS privacy.{s.buying ? " Pay with any token; we point it at your site for you." : " Checkout here is coming soon."}
        </p>
      )}
    </div>
  );
}

function BuyPanel({ projectId, offer, onBack, onLive }: { projectId: string; offer: Offer; onBack: () => void; onLive: () => void }) {
  const [coins, setCoins] = useState<Array<{ key: string; label: string; chain: string }>>([]);
  const [pay, setPay] = useState("base:USDC");
  const [refundTo, setRefundTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [copied, setCopied] = useState(false);
  const base = `/api/projects/${projectId}/domain/buy`;

  useEffect(() => { fetch("/api/intents").then((r) => r.json()).then((j) => setCoins(j.payWith ?? [])).catch(() => undefined); }, []);

  const final = order?.state === "live" || order?.state === "refund" || order?.state === "closed";
  useEffect(() => {
    if (!quote || final) return;
    const h = setInterval(async () => {
      const j = await fetch(`${base}?depositAddress=${encodeURIComponent(quote.depositAddress)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (j?.order) { setOrder(j.order as Order); if (j.order.state === "live") onLive(); }
    }, 7000);
    return () => clearInterval(h);
  }, [quote, final, base, onLive]);

  async function getQuote() {
    setBusy(true); setError(null);
    const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: offer.domain, pay, refundTo: refundTo.trim() }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setError(j?.error ?? "No quote right now. Try again.");
    setQuote(j as Quote);
  }

  const coin = coins.find((c) => c.key === pay);
  const WORDS: Record<Order["state"], string> = {
    awaiting: "Waiting for your deposit",
    paid: "Paid. Registering the domain…",
    registering: "Registering with Spaceship…",
    live: "Done. The domain is yours and points at your site.",
    refund: "We couldn't buy it, so a refund is on its way.",
    closed: "This deposit expired or was refunded.",
  };
  const words = order ? (order.state === "paid" && order.waiting ? "Paid. We'll register it shortly and email you." : WORDS[order.state]) : WORDS.awaiting;

  return (
    <div className="space-y-3 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-white">{offer.domain}</span>
        <span className="text-[12.5px] text-zinc-300">{money(offer.total!)} for a year</span>
      </div>
      {!quote ? (
        <>
          <select className="field" value={pay} onChange={(e) => setPay(e.target.value)} aria-label="Pay with">
            {coins.map((c) => <option key={c.key} value={c.key}>{c.label} on {c.chain}</option>)}
          </select>
          <input className="field font-mono text-[12.5px]" spellCheck={false} value={refundTo} onChange={(e) => setRefundTo(e.target.value)} placeholder={`Your ${coin?.chain ?? ""} address, for a refund`} aria-label="Refund address" />
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
            <button type="button" className="btn btn-primary flex-1" disabled={busy || refundTo.trim().length < 8} onClick={() => void getQuote()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Get deposit address
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">Renewal is {offer.renew != null ? `${money(offer.renew)} a year at Spaceship's price` : "at Spaceship's price"}. You can ask for the transfer code any time to move it to your own registrar.</p>
        </>
      ) : (
        <>
          <p className="text-[13px] text-zinc-300">Send exactly <span className="font-semibold text-white">{quote.amountIn} {quote.symbol}</span> on {quote.chain} to:</p>
          <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.08] bg-ink-900 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-white">{quote.depositAddress}</code>
            <button type="button" className="btn btn-ghost btn-icon h-8 w-8 shrink-0" aria-label="Copy address" onClick={() => { void navigator.clipboard.writeText(quote.depositAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="flex items-start gap-2 text-[12.5px] text-zinc-400">
            {order?.state === "live" ? <CheckCircle2 size={14} className="mt-px shrink-0 text-lime" /> : order?.state === "refund" || order?.state === "closed" ? <AlertTriangle size={14} className="mt-px shrink-0 text-amber-300" /> : <Loader2 size={14} className="mt-px shrink-0 animate-spin" />}
            <span>{words}{order?.error && order.state === "refund" ? ` (${order.error})` : ""}</span>
          </p>
        </>
      )}
      {error && <p role="alert" className="text-[12.5px] text-amber-300">{error}</p>}
    </div>
  );
}

/** Writes the listed records on Spaceship for a domain the team already has there. The key isn't kept. */
export function SpaceshipConnect({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function go() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/projects/${projectId}/domain/spaceship`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, secret }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok) { setMsg({ ok: true, text: "Records added on Spaceship. Checking DNS…" }); setKey(""); setSecret(""); onDone(); }
    else setMsg({ ok: false, text: j?.error ?? "That didn't work. Check the key and try again." });
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline w-full justify-center" onClick={() => setOpen(true)}>
        <BrandIcon icon={BRANDS.spaceship} size={14} /> Domain on Spaceship? Add the records for me <Wand2 size={13} />
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-[10px] border border-white/[0.07] bg-ink-900 p-3">
      <p className="text-[12px] text-zinc-400">
        Make an API key in Spaceship&apos;s <a className="text-zinc-200 underline-offset-2 hover:underline" href="https://www.spaceship.com/application/api-manager/" target="_blank" rel="noreferrer">API Manager</a> with <b className="font-medium text-zinc-200">Domains: read</b> and <b className="font-medium text-zinc-200">DNS records: write</b>. It&apos;s used once for this and never saved.
      </p>
      <input className="field font-mono text-[12.5px]" placeholder="API key" spellCheck={false} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Spaceship API key" />
      <input className="field font-mono text-[12.5px]" type="password" placeholder="API secret" spellCheck={false} autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} aria-label="Spaceship API secret" />
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setMsg(null); }}>Cancel</button>
        <button type="button" className="btn btn-primary flex-1" disabled={busy || key.trim().length < 8 || secret.trim().length < 8} onClick={() => void go()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Add records
        </button>
      </div>
      {msg && <p className={`text-[12px] ${msg.ok ? "text-lime" : "text-amber-300"}`}>{msg.text}</p>}
    </div>
  );
}

/** One click for a domain on Cloudflare DNS: a token with Zone → DNS → Edit, used once and never saved. */
export function CloudflareConnect({ projectId, host, onDone }: { projectId: string; host: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function go() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/projects/${projectId}/domain/cloudflare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    setToken("");
    if (r?.ok) {
      const gone = (j?.replaced as string[] | undefined)?.length ? ` Replaced ${(j.replaced as string[]).join(", ")}.` : "";
      setMsg({ ok: true, text: `Records added on Cloudflare.${gone} Checking DNS…` });
      onDone();
    } else setMsg({ ok: false, text: j?.error ?? "That didn't work. Check the token and try again." });
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary w-full justify-center" onClick={() => setOpen(true)}>
        <BrandIcon icon={BRANDS.cloudflare} size={14} /> Connect with Cloudflare in one step <Wand2 size={13} />
      </button>
    );
  }
  return (
    <div className="min-w-0 space-y-2 rounded-[10px] border border-white/[0.07] bg-ink-900 p-3">
      <ol className="list-decimal space-y-1 pl-4 text-[12px] text-zinc-400">
        <li>Open <a className="text-zinc-200 underline-offset-2 hover:underline" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Cloudflare API tokens</a> and press <b className="font-medium text-zinc-200">Create Token</b>, then <b className="font-medium text-zinc-200">Edit zone DNS</b>.</li>
        <li>Under Zone Resources pick <span className="break-all font-mono text-zinc-200">{host.split(".").slice(-2).join(".")}</span>, create it and paste it here.</li>
      </ol>
      <p className="text-[11px] text-zinc-500">The token is used once for this and never saved. You can delete it on Cloudflare right after.</p>
      <input className="field font-mono text-[12.5px]" type="password" placeholder="Cloudflare API token" spellCheck={false} autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Cloudflare API token" />
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setMsg(null); setToken(""); }}>Cancel</button>
        <button type="button" className="btn btn-primary flex-1" disabled={busy || token.trim().length < 20} onClick={() => void go()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Add records
        </button>
      </div>
      {msg && <p className={`text-[12px] ${msg.ok ? "text-lime" : "text-amber-300"}`}>{msg.text}</p>}
    </div>
  );
}
