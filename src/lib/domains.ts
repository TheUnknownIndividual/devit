import { domainToASCII } from "node:url";
import { token } from "./secrets";
import { sitesDomain } from "./sites";
import { getProject } from "./store";
import { routing } from "./routing";
import type { CustomDomain, DomainStatus, Project } from "./spec";

// Custom domains (Pro). The owner points the domain at CUSTOM_DOMAIN_TARGET and proves it's theirs with a TXT record
// at _sitesmith.<domain>. DNS is read over HTTPS from two public resolvers, so a broken local resolver can't lie.
// With CF_API_TOKEN and CF_ZONE_ID set, a verified domain also gets a Cloudflare for SaaS custom hostname (and its
// certificate); without them the owner routes the domain to the edge Worker by hand.
//
//   pending   added, TXT not seen yet
//   verified  TXT seen: the domain routes to the site
//   live      also pointing at us (and, with Cloudflare, the certificate is active)

const INTERNAL_TLDS = new Set(["localhost", "local", "internal", "intranet", "lan", "home", "corp", "private", "test", "example", "invalid", "onion", "arpa", "localdomain", "alt"]);
// Second-level suffixes where the registrable domain has three labels, for the apex guess before DNS is read.
const TWO_LEVEL = /\.(co|com|net|org|gov|edu|ac|or|ne|go)\.[a-z]{2}$/;

export const customTarget = (): string | null => {
  const t = process.env.CUSTOM_DOMAIN_TARGET?.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (t && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t)) return t;
  const d = sitesDomain();
  return d ? `sites.${d}` : null;
};

export const cfEnabled = () => !!(process.env.CF_API_TOKEN?.trim() && process.env.CF_ZONE_ID?.trim());

/** A domain as typed ("https://Bücher.example.com/") → "xn--bcher-kva.example.com", or why it can't be used. */
export function normalizeDomain(input: string): { host: string } | { error: string } {
  const s = input.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0].replace(/\.$/, "");
  if (!s) return { error: "Enter a domain, like example.com or app.example.com." };
  if (s.startsWith("[") || /^[\d.]+(:\d+)?$/.test(s) || (s.match(/:/g)?.length ?? 0) > 1) return { error: "Use a domain name, not an IP address." };
  if (/:\d*$/.test(s)) return { error: "Leave the port out." };
  const host = domainToASCII(s);
  if (!host || host.length > 253) return { error: "That isn't a valid domain." };
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return { error: "That isn't a valid domain." };
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld)) return { error: "Use a domain name, not an IP address." };
  if (INTERNAL_TLDS.has(tld) || host === "home.arpa") return { error: "That's an internal name; use a public domain." };
  const t = customTarget();
  // The target and the domain it sits under (sites.example.xyz → example.xyz) are ours.
  const ours = [sitesDomain(), t, t && t.split(".").length > 2 ? t.split(".").slice(1).join(".") : null].filter((x): x is string => !!x);
  if (ours.some((d) => host === d || host.endsWith(`.${d}`))) return { error: "That's one of our own addresses; it's already your site address." };
  return { host };
}

export const guessApex = (host: string) => host.split(".").length === 2 || (host.split(".").length === 3 && TWO_LEVEL.test(`.${host}`));
export const txtName = (host: string) => `_sitesmith.${host}`;
export const newDomain = (host: string, apex: boolean): CustomDomain => ({ host, token: `sitesmith-verify=${token(18)}`, status: "pending", apex, at: Date.now() });

// ---------- DNS over HTTPS ----------

export type RrType = "A" | "AAAA" | "CNAME" | "TXT" | "SOA";
const TYPE_NO: Record<RrType, number> = { A: 1, CNAME: 5, SOA: 6, TXT: 16, AAAA: 28 };
export interface Rr { name: string; type: number; data: string }
/** Answers for a name, or null when no resolver could be reached. */
export type Resolver = (name: string, type: RrType) => Promise<Rr[] | null>;

const DOH = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];

export const doh: Resolver = async (name, type) => {
  const all = await Promise.all(DOH.map((u) =>
    fetch(`${u}?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" }, cache: "no-store", signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ Status: number; Answer?: Rr[] }>) : null)).catch(() => null)));
  // NOERROR and NXDOMAIN are both answers; SERVFAIL and unreachable aren't.
  const ok = all.filter((j): j is { Status: number; Answer?: Rr[] } => !!j && (j.Status === 0 || j.Status === 3));
  if (!ok.length) return null;
  const seen = new Map<string, Rr>();
  for (const j of ok) for (const a of j.Answer ?? []) seen.set(`${a.type}:${a.data}`, { ...a, name: a.name.toLowerCase().replace(/\.$/, "") });
  return [...seen.values()];
};

const bare = (s: string) => s.toLowerCase().replace(/\.$/, "");
// TXT data comes quoted, long values split into several quoted strings.
const txtValue = (d: string) => (d.match(/"((?:[^"\\]|\\.)*)"/g)?.map((q) => q.slice(1, -1)).join("") ?? d).trim();

/** Whether the name is a zone apex: it has its own SOA. Null when DNS couldn't be read. */
export async function isApex(host: string, resolve: Resolver = doh): Promise<boolean | null> {
  const a = await resolve(host, "SOA");
  return a ? a.some((r) => r.type === TYPE_NO.SOA && bare(r.name) === host) : null;
}

export interface DnsCheck {
  resolved: boolean;
  txt: { name: string; expected: string; found: string[]; ok: boolean };
  route: { name: string; expected: string; found: string[]; ok: boolean };
  targetIps: string[];
}

/** Reads the TXT proof and where the domain points; pointing means a CNAME to the target or the target's addresses. */
export async function checkDns(d: Pick<CustomDomain, "host" | "token">, target: string, resolve: Resolver = doh): Promise<DnsCheck> {
  const [txt, a, ta] = await Promise.all([resolve(txtName(d.host), "TXT"), resolve(d.host, "A"), resolve(target, "A")]);
  const found = (txt ?? []).filter((r) => r.type === TYPE_NO.TXT).map((r) => txtValue(r.data));
  const cnames = (a ?? []).filter((r) => r.type === TYPE_NO.CNAME).map((r) => bare(r.data));
  const ips = (a ?? []).filter((r) => r.type === TYPE_NO.A).map((r) => r.data);
  const targetIps = (ta ?? []).filter((r) => r.type === TYPE_NO.A).map((r) => r.data);
  const pointing = cnames.includes(target) || ips.some((ip) => targetIps.includes(ip));
  return {
    resolved: txt !== null && a !== null,
    txt: { name: txtName(d.host), expected: d.token, found, ok: found.includes(d.token) },
    route: { name: d.host, expected: target, found: cnames.length ? cnames : ips, ok: pointing },
    targetIps,
  };
}

let targetIpCache: { t: string; ips: string[]; at: number } | null = null;
export async function targetAddresses(target: string): Promise<string[]> {
  if (targetIpCache?.t === target && Date.now() - targetIpCache.at < 10 * 60_000) return targetIpCache.ips;
  const ips = ((await doh(target, "A")) ?? []).filter((r) => r.type === TYPE_NO.A).map((r) => r.data);
  // A miss is kept for a minute too (as if fetched 9 min ago), so a resolver outage doesn't slow every dialog open.
  targetIpCache = { t: target, ips, at: ips.length ? Date.now() : Date.now() - 9 * 60_000 };
  return ips;
}

// ---------- Cloudflare for SaaS ----------

interface CfHostname { id: string; hostname: string; status: string; ssl?: { status?: string }; ownership_verification?: { type?: string; name?: string; value?: string } }
type CfResult<T> = { ok: true; result: T } | { ok: false; error: string };

async function cf<T>(method: string, rel: string, body?: unknown): Promise<CfResult<T>> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CF_ZONE_ID!.trim()}/custom_hostnames${rel}`, {
    method,
    headers: { authorization: `Bearer ${process.env.CF_API_TOKEN!.trim()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r) return { ok: false, error: "Couldn't reach Cloudflare." };
  const j = (await r.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code: number; message: string }[] } | null;
  if (!r.ok || !j?.success) return { ok: false, error: j?.errors?.[0]?.message ?? `Cloudflare answered ${r.status}.` };
  return { ok: true, result: j.result as T };
}

const cfState = (h: CfHostname): NonNullable<CustomDomain["cf"]> => ({
  id: h.id, status: h.status, ssl: h.ssl?.status ?? "unknown",
  txt: h.status !== "active" && h.ownership_verification?.name && h.ownership_verification.value ? { name: bare(h.ownership_verification.name), value: h.ownership_verification.value } : undefined,
});

/** Creates the custom hostname (or finds the one already there) and reads its state. */
export async function cfEnsure(host: string, id?: string): Promise<NonNullable<CustomDomain["cf"]> | { error: string }> {
  if (id) {
    const g = await cf<CfHostname>("GET", `/${id}`);
    if (g.ok) return cfState(g.result);
  }
  const made = await cf<CfHostname>("POST", "", { hostname: host, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } });
  if (made.ok) return cfState(made.result);
  const list = await cf<CfHostname[]>("GET", `?hostname=${encodeURIComponent(host)}`);
  const h = list.ok ? list.result.find((x) => x.hostname === host) : undefined;
  return h ? cfState(h) : { error: made.error };
}

export async function cfRemove(id: string): Promise<void> {
  await cf("DELETE", `/${id}`).catch(() => undefined);
}

/** Next status from a check. Once proven, a domain stays verified even if the TXT record is later removed. */
export function nextStatus(d: CustomDomain, c: DnsCheck): DomainStatus {
  const proven = d.status !== "pending" || c.txt.ok;
  if (!proven) return "pending";
  const certOk = !cfEnabled() || (d.cf?.status === "active" && d.cf.ssl === "active");
  return c.route.ok && certOk ? "live" : "verified";
}

/** The records to add, in the order the owner should add them. */
export function dnsRecords(d: CustomDomain, target: string, ips: string[]) {
  const rows: { type: string; name: string; value: string; note?: string }[] = [
    { type: "TXT", name: txtName(d.host), value: d.token, note: "Proves the domain is yours." },
  ];
  if (d.apex) {
    rows.push({ type: "CNAME", name: d.host, value: target, note: "At the root: use ALIAS or ANAME if your DNS host has it. On Cloudflare DNS a root CNAME works (it's flattened)." });
    if (ips.length) rows.push({ type: "A", name: d.host, value: ips.join(", "), note: "Only if your DNS host has no ALIAS, ANAME or flattening." });
  } else rows.push({ type: "CNAME", name: d.host, value: target, note: "If the domain is on Cloudflare, set this record to DNS only (grey cloud)." });
  if (d.cf?.txt) rows.push({ type: "TXT", name: d.cf.txt.name, value: d.cf.txt.value, note: "Cloudflare's own check, for the certificate." });
  return rows;
}

// ---------- for the routes ----------

/** Another project that has already proven this domain. Pending claims don't block: the TXT proof decides. */
export async function claimedElsewhere(host: string, id: string): Promise<boolean> {
  const r = (await routing()).hosts[host];
  if (!r || r.id === id) return false;
  const other = await getProject(r.id);
  return !!other?.domain && other.domain.host === host && other.domain.status !== "pending";
}

/** What the builder's Custom domain section shows. */
export async function domainView(p: Project, entitled: boolean) {
  const target = customTarget();
  const d = p.domain ?? null;
  return {
    entitled,
    target,
    cloudflare: cfEnabled(),
    published: !!p.published,
    domain: d && { host: d.host, status: d.status, apex: d.apex, checkedAt: d.checkedAt ?? null, cf: d.cf ? { status: d.cf.status, ssl: d.cf.ssl, error: d.cf.error ?? null } : null },
    records: d && target ? dnsRecords(d, target, d.apex ? await targetAddresses(target) : []) : [],
  };
}
