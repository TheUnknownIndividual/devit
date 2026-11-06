import { txtName } from "./domains";

// Spaceship (spaceship.com) for buying a domain from the builder and pointing it at the site.
//  - Search: availability and the one-year register price for a few names at once (our account's key, read scopes).
//  - Buy: the team pays us with any token (NEAR Intents, like plans); once it lands we register the domain on our
//    Spaceship account, then write its DNS. Registration spends our Spaceship balance, so it only runs when
//    DOMAIN_PURCHASES=live. The domain stays the team's: they can ask for the transfer code at any time.
//  - Connect: a team that already owns a domain on Spaceship pastes an API key once and we write the records for them.
//    The key is used for that one call and never stored.
//
// API: https://docs.spaceship.dev. Base https://spaceship.dev/api, headers X-API-Key and X-API-Secret.

const BASE = "https://spaceship.dev/api";

export type SsKey = { key: string; secret: string };

export const ourKey = (): SsKey | null => {
  const key = process.env.SPACESHIP_API_KEY?.trim(), secret = process.env.SPACESHIP_API_SECRET?.trim();
  return key && secret ? { key, secret } : null;
};
/** Search needs our read key; buying also needs the registrant contact and the owner's go-ahead. */
export const searchOn = () => !!ourKey();
export const buyingOn = () => !!ourKey() && !!process.env.SPACESHIP_CONTACT_ID?.trim() && process.env.DOMAIN_PURCHASES === "live" && !!process.env.PAYMENTS_NEAR_ACCOUNT?.trim();
/** Our fee on top of Spaceship's price, in USD (covers swap costs and support). */
export const domainFee = () => Math.max(0, Number(process.env.DOMAIN_FEE_USD ?? 3) || 0);
/** Above this the price is too far from a normal registration to sell through a quick checkout. */
const MAX_PRICE = 100;

type Res<T> = { ok: true; data: T; headers: Headers } | { ok: false; status: number; error: string };

async function ss<T>(k: SsKey, method: string, path: string, body?: unknown): Promise<Res<T>> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "X-API-Key": k.key, "X-API-Secret": k.secret, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, error: "Couldn't reach Spaceship." };
  const text = await r.text();
  if (!r.ok) {
    let msg = "";
    try { const j = JSON.parse(text) as { detail?: string; title?: string }; msg = j.detail || j.title || ""; } catch { /* not JSON */ }
    if (r.status === 401) msg = "Spaceship didn't accept that API key and secret.";
    if (r.status === 403) msg = msg || "That API key is missing a permission (it needs DNS records: write).";
    return { ok: false, status: r.status, error: msg || `Spaceship answered ${r.status}.` };
  }
  let data = null as T;
  try { data = (text ? JSON.parse(text) : null) as T; } catch { /* 202/204 have no body */ }
  return { ok: true, data, headers: r.headers };
}

// ---------- search ----------

export interface DomainOffer { domain: string; available: boolean; premium: boolean; price: number | null; total: number | null; renew: number | null }

type Price = { amount: string; currency: string };
type PriceItem = { period: { value: number; unit: string }; priceInDefaultCurrency: { finalPrice: Price; regularPrice: Price } };
type DomainPrice = { domain: string; priceClass?: "standard" | "premium"; prices?: { register?: PriceItem[]; renew?: PriceItem[] }; errorCode?: string };

const oneYear = (items?: PriceItem[]) => {
  const p = items?.find((i) => i.period.value === 1 && i.period.unit === "y")?.priceInDefaultCurrency.finalPrice;
  return p && p.currency === "USD" ? Number(p.amount) : null;
};

const TLDS = ["com", "xyz", "io", "fun", "lol", "meme", "app", "co", "net", "org", "ai", "gg", "wtf", "money", "finance"];

/** Names to try for a search word: the exact name if it has a TLD, else the word on popular TLDs and a few prefixes. */
export function candidates(q: string): string[] {
  const clean = q.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^\$/, "");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean)) {
    const [base] = clean.split(".");
    return [clean, ...TLDS.map((t) => `${base}.${t}`).filter((d) => d !== clean)].slice(0, 12);
  }
  const base = clean.replace(/[^a-z0-9-]+/g, "").replace(/^-+|-+$/g, "").slice(0, 50);
  if (base.length < 2) return [];
  return [...TLDS.slice(0, 10).map((t) => `${base}.${t}`), `get${base}.com`, `${base}coin.com`].slice(0, 12);
}

/** Availability and price for up to 12 names, available ones first, cheapest first. */
export async function searchDomains(q: string): Promise<{ offers: DomainOffer[] } | { error: string }> {
  const k = ourKey();
  if (!k) return { error: "Domain search isn't set up on this server yet." };
  const names = candidates(q);
  if (!names.length) return { error: "Type a name, like your ticker." };
  const [av, pr] = await Promise.all([
    ss<{ domains: { domain: string; result: string }[] }>(k, "POST", "/v1/domains/available", { domains: names }),
    ss<{ domains: DomainPrice[] }>(k, "POST", "/v1/domains/pricing/query", { domains: names }),
  ]);
  if (!av.ok) return { error: av.error };
  const prices = new Map((pr.ok ? pr.data.domains : []).map((d) => [d.domain, d]));
  const fee = domainFee();
  const offers = av.data.domains.filter((d) => d.result === "available" || d.result === "taken").map((d): DomainOffer => {
    const p = prices.get(d.domain);
    const price = oneYear(p?.prices?.register);
    const sellable = d.result === "available" && price != null && price <= MAX_PRICE;
    return { domain: d.domain, available: sellable, premium: p?.priceClass === "premium", price: sellable ? price : null, total: sellable ? Math.ceil((price! + fee) * 100) / 100 : null, renew: oneYear(p?.prices?.renew) };
  });
  offers.sort((a, b) => Number(b.available) - Number(a.available) || (a.total ?? 1e9) - (b.total ?? 1e9) || names.indexOf(a.domain) - names.indexOf(b.domain));
  return { offers };
}

/** The current one-year price of one name, or null if it can't be bought now. */
export async function quoteDomain(domain: string): Promise<DomainOffer | null> {
  const r = await searchDomains(domain);
  return "error" in r ? null : r.offers.find((o) => o.domain === domain && o.available) ?? null;
}

// ---------- buying ----------

/** Registers one name for a year on our account. Returns the async operation id to poll. */
export async function registerDomain(domain: string): Promise<{ op: string } | { error: string }> {
  const k = ourKey(), contact = process.env.SPACESHIP_CONTACT_ID?.trim();
  if (!k || !contact) return { error: "Domain buying isn't set up." };
  const r = await ss<null>(k, "POST", `/v1/domains/${encodeURIComponent(domain)}`, {
    autoRenew: false, years: 1,
    privacyProtection: { level: "high", userConsent: true },
    contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
  });
  if (!r.ok) return { error: r.error };
  const op = r.headers.get("spaceship-async-operationid");
  return op ? { op } : { error: "Spaceship didn't return an operation id." };
}

export async function operation(op: string): Promise<"pending" | "success" | "failed" | null> {
  const k = ourKey();
  if (!k) return null;
  const r = await ss<{ status: "pending" | "success" | "failed" }>(k, "GET", `/v1/async-operations/${encodeURIComponent(op)}`);
  return r.ok ? r.data.status : null;
}

// ---------- DNS ----------

/** The records that point a domain at our sites: the ownership TXT, then ALIAS at the root or CNAME on a subdomain. */
export function pointingRecords(host: string, apex: string, token: string, target: string, cfTxt?: { name: string; value: string }) {
  const rel = (name: string) => (name === apex ? "@" : name.endsWith(`.${apex}`) ? name.slice(0, -apex.length - 1) : null);
  const items: Array<Record<string, unknown>> = [];
  const t = rel(txtName(host));
  if (t) items.push({ type: "TXT", name: t, value: token, ttl: 600 });
  const h = rel(host);
  if (h === "@") items.push({ type: "ALIAS", name: "@", aliasName: target, ttl: 600 });
  else if (h) items.push({ type: "CNAME", name: h, cname: target, ttl: 600 });
  if (cfTxt) { const c = rel(cfTxt.name); if (c) items.push({ type: "TXT", name: c, value: cfTxt.value, ttl: 600 }); }
  return items;
}

/** Writes records into a Spaceship-hosted zone, with our key or one the team pasted. */
export async function writeRecords(k: SsKey, apex: string, items: Array<Record<string, unknown>>): Promise<{ ok: true } | { error: string }> {
  if (!items.length) return { error: "That domain isn't under the one you named." };
  const r = await ss<null>(k, "PUT", `/v1/dns/records/${encodeURIComponent(apex)}`, { force: true, items });
  return r.ok ? { ok: true } : { error: r.error };
}

/**
 * Which domain on this Spaceship account holds the host (the host itself or a parent), or null. Records written on
 * Spaceship only count when the domain uses Spaceship's own nameservers ("basic").
 */
export async function zoneFor(k: SsKey, host: string): Promise<string | { error: string } | null> {
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const name = labels.slice(i).join(".");
    const r = await ss<{ name: string; nameservers?: { provider?: string; hosts?: string[] } }>(k, "GET", `/v1/domains/${encodeURIComponent(name)}`);
    if (r.ok) {
      if (r.data.nameservers?.provider && r.data.nameservers.provider !== "basic") return { error: `${name} uses other nameservers (${(r.data.nameservers.hosts ?? []).slice(0, 2).join(", ")}), so add the records there instead.` };
      return name;
    }
    if (r.status === 401 || r.status === 403) return { error: r.status === 403 ? "That API key needs the Domains: read and DNS records: write permissions." : r.error };
  }
  return null;
}
