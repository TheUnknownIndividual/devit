import { DEFAULT_RPC } from "./chain";

// Reads a project's treasury from public sources, no key needed: the NEAR RPC (balance, Sputnik DAO v2 policy and
// proposals, validator pools, NEP-141 metadata), FastNEAR's account API (every FT the account holds), intents.near
// (mt_batch_balance_of), NearBlocks (recent transfers) and DexScreener (prices). NEAR Treasury (Trezu) is a front end
// on the same Sputnik DAO contracts, so reading the contracts shows exactly what it shows. NEAR Business has no
// public API; NEARBLOCKS_API_KEY (optional) only lifts NearBlocks' rate limit.

export interface TreasuryHolding {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number | null;
  usd: number | null;
  logo: string | null;
  kind: "native" | "staked" | "ft" | "intents";
  url: string;
}
export interface TreasuryTransfer { dir: "in" | "out"; symbol: string; amount: number; usd: number | null; peer: string; at: number; url: string }
export interface TreasuryProposal { id: number; kind: string; title: string; status: string; at: number; amount: string | null; url: string }
export interface TreasuryDao { members: number; need: number | null; groups: string[]; proposals: TreasuryProposal[]; count: number }
export interface TreasuryAccount {
  account: string;
  url: string;
  kind: "dao" | "account";
  holdings: TreasuryHolding[];
  totalUsd: number;
  /** Tokens held that no market prices (airdrop spam), not counted in the total. */
  unpriced: number;
  transfers: TreasuryTransfer[];
  dao: TreasuryDao | null;
  error?: string;
}
export interface TreasuryData { accounts: TreasuryAccount[]; totalUsd: number; at: number }

const NB = "https://nearblocks.io";
const TTL = 60_000;
export const ACCOUNT_RE = /^(?:[a-z0-9]+(?:[-_.][a-z0-9]+)*)$/;
export const validAccount = (a: string) => a.length >= 2 && a.length <= 64 && ACCOUNT_RE.test(a);

async function getJson<T>(url: string, init?: RequestInit, ms = 6000): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

async function rpcQuery<T>(params: Record<string, unknown>): Promise<T | null> {
  const r = await getJson<{ result?: T & { error?: string } }>(DEFAULT_RPC.near, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { finality: "final", ...params } }),
  });
  return r?.result && !(r.result as { error?: string }).error ? r.result : null;
}

async function view<T>(account: string, method: string, args: unknown = {}): Promise<T | null> {
  const r = await rpcQuery<{ result: number[] }>({ request_type: "call_function", account_id: account, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  if (!r?.result) return null;
  try { return JSON.parse(Buffer.from(r.result).toString("utf8")) as T; } catch { return null; }
}

// ---------- tokens ----------

interface Meta { symbol: string; name: string; decimals: number; icon: string | null }
const metaCache = new Map<string, Meta | null>();

async function metaOf(contract: string): Promise<Meta | null> {
  if (metaCache.has(contract)) return metaCache.get(contract)!;
  const m = await view<{ symbol?: string; name?: string; decimals?: number; icon?: string }>(contract, "ft_metadata");
  const out = m && typeof m.decimals === "number" && typeof m.symbol === "string"
    ? { symbol: m.symbol.slice(0, 12), name: String(m.name ?? m.symbol).slice(0, 40), decimals: m.decimals, icon: typeof m.icon === "string" && m.icon.length < 6000 ? m.icon : null }
    : null;
  if (metaCache.size > 2000) metaCache.clear();
  metaCache.set(contract, out);
  return out;
}

const STABLE = /a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48|dac17f958d2ee523a2206206994597c13d831ec7|833589fcd6edb6e08f4c7c32d4f71b54bda02913|5ce3bf3a31af18be40ba30f721101b4341690186|^17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1$|^usdt\.tether-token\.near$|^eth-0x(?:a0b8|dac1)/i;

/** USD price per token contract from DexScreener, taking each token's deepest pool and ignoring dust pools. */
async function pricesOf(contracts: string[]): Promise<Map<string, { usd: number; logo: string | null }>> {
  const out = new Map<string, { usd: number; logo: string | null }>();
  const ids = [...new Set(contracts)];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const liq = new Map<string, number>();
  await Promise.all(chunks.map(async (c) => {
    const pairs = await getJson<Array<{ baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number }; info?: { imageUrl?: string } }>>(`https://api.dexscreener.com/tokens/v1/near/${c.map(encodeURIComponent).join(",")}`);
    for (const p of Array.isArray(pairs) ? pairs : []) {
      const a = p.baseToken.address, l = p.liquidity?.usd ?? 0, px = Number(p.priceUsd);
      if (l < 5000 || !(px > 0) || l <= (liq.get(a) ?? 0)) continue;
      liq.set(a, l);
      out.set(a, { usd: px, logo: p.info?.imageUrl ?? null });
    }
  }));
  for (const c of ids) if (!out.has(c) && STABLE.test(c)) out.set(c, { usd: 1, logo: null });
  return out;
}

const units = (raw: string, decimals: number) => Number(BigInt(raw || "0")) / 10 ** decimals;

// ---------- one account ----------

interface Policy { roles: Array<{ name: string; kind: unknown; permissions: string[]; vote_policy: Record<string, { threshold: unknown }> }>; default_vote_policy: { threshold: unknown } }

const KIND_LABEL: Record<string, string> = {
  Transfer: "Payment", AddMemberToRole: "Add member", RemoveMemberFromRole: "Remove member", FunctionCall: "Contract call", ChangePolicy: "Policy change",
  ChangeConfig: "Config change", AddBounty: "Bounty", BountyDone: "Bounty done", Vote: "Poll", UpgradeSelf: "Upgrade", UpgradeRemote: "Upgrade", SetStakingContract: "Staking", AddMemberToRoleBatch: "Add members",
};
const STATUS_LABEL: Record<string, string> = { InProgress: "Voting", Approved: "Approved", Rejected: "Rejected", Removed: "Removed", Expired: "Expired", Moved: "Moved", Failed: "Failed" };

function cleanTitle(d: string): string {
  const first = d.split("$$$$")[0].replace(/<br\s*\/?>/gi, "\n").split("\n").map((x) => x.replace(/^[\s*#>-]+/, "").replace(/^(title|proposal)\s*:\s*/i, "").trim()).find(Boolean) ?? "";
  return first.length > 90 ? `${first.slice(0, 87)}...` : first;
}

async function readDao(account: string): Promise<TreasuryDao | null> {
  const [policy, last] = await Promise.all([view<Policy>(account, "get_policy"), view<number>(account, "get_last_proposal_id")]);
  if (!policy?.roles) return null;
  // Voting groups: the member list of every role that can approve a payment. Threshold read for payments, else the DAO default.
  const voters = policy.roles.filter((r) => r.kind && typeof r.kind === "object" && "Group" in (r.kind as object) && r.permissions.some((p) => /^(\*|transfer):(VoteApprove|\*)$/.test(p)));
  const members = new Set<string>();
  for (const r of voters) for (const m of (r.kind as { Group: string[] }).Group) members.add(m);
  const first = voters[0];
  const vp = (first?.vote_policy?.transfer ?? policy.default_vote_policy)?.threshold;
  const size = first ? (first.kind as { Group: string[] }).Group.length : members.size;
  const need = Array.isArray(vp) ? Math.min(size, Math.floor((size * Number(vp[0])) / Number(vp[1])) + 1) : typeof vp === "string" && vp ? Math.min(size, Number(vp)) : null;
  const count = typeof last === "number" ? last : 0;
  const raw = count > 0 ? await view<Array<{ id: number; kind: Record<string, Record<string, string> | null> | string; description: string; status: string; submission_time: string }>>(account, "get_proposals", { from_index: Math.max(0, count - 6), limit: 6 }) : [];
  const proposals = await Promise.all((raw ?? []).reverse().slice(0, 5).map(async (p): Promise<TreasuryProposal> => {
    const k = typeof p.kind === "string" ? p.kind : Object.keys(p.kind)[0] ?? "";
    let amount: string | null = null;
    const t = typeof p.kind === "object" ? (p.kind as Record<string, Record<string, string> | null>).Transfer : null;
    if (t) {
      const m = t.token_id ? await metaOf(t.token_id) : { symbol: "NEAR", decimals: 24 };
      if (m) amount = `${fmt(units(t.amount, m.decimals))} ${m.symbol}`;
    }
    return {
      id: p.id, kind: KIND_LABEL[k] ?? k, title: cleanTitle(p.description) || KIND_LABEL[k] || k, status: STATUS_LABEL[p.status] ?? p.status,
      at: Math.round(Number(BigInt(p.submission_time || "0") / 1_000_000n)), amount, url: `${NB}/address/${account}`,
    };
  }));
  return { members: members.size, need, groups: voters.map((r) => r.name), proposals, count };
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 });

async function readTransfers(account: string, price: (symbol: string) => number | null): Promise<TreasuryTransfer[]> {
  const headers: Record<string, string> = process.env.NEARBLOCKS_API_KEY ? { authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {};
  const api = `https://api.nearblocks.io/v1/account/${account}`;
  const [txns, fts] = await Promise.all([
    getJson<{ txns?: Array<{ predecessor_account_id: string; receiver_account_id: string; transaction_hash: string; block_timestamp: string; actions?: Array<{ action: string; deposit?: number }> }> }>(`${api}/txns?per_page=25`, { headers }),
    getJson<{ txns?: Array<{ involved_account_id: string; delta_amount: string; transaction_hash: string; block_timestamp: string; ft?: { symbol: string; decimals: number; contract?: string } }> }>(`${api}/ft-txns?per_page=25`, { headers }),
  ]);
  const out: TreasuryTransfer[] = [];
  const at = (ts: string) => Math.round(Number(BigInt(ts) / 1_000_000n));
  for (const t of txns?.txns ?? []) {
    const dep = t.actions?.find((a) => a.action === "TRANSFER")?.deposit;
    if (!dep || dep < 1e22) continue;
    const out_ = t.predecessor_account_id === account;
    const amount = dep / 1e24, px = price("NEAR");
    out.push({ dir: out_ ? "out" : "in", symbol: "NEAR", amount, usd: px ? amount * px : null, peer: out_ ? t.receiver_account_id : t.predecessor_account_id, at: at(t.block_timestamp), url: `${NB}/txns/${t.transaction_hash}` });
  }
  for (const t of fts?.txns ?? []) {
    if (!t.ft || !t.delta_amount || t.delta_amount === "0") continue;
    const amount = Math.abs(units(t.delta_amount, t.ft.decimals));
    const px = price(t.ft.contract ?? t.ft.symbol);
    out.push({ dir: t.delta_amount.startsWith("-") ? "out" : "in", symbol: t.ft.symbol.slice(0, 12), amount, usd: px ? amount * px : null, peer: t.involved_account_id, at: at(t.block_timestamp), url: `${NB}/txns/${t.transaction_hash}` });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 10);
}

async function readAccount(account: string, nearUsd: number | null): Promise<TreasuryAccount> {
  const base: TreasuryAccount = { account, url: `${NB}/address/${account}`, kind: "account", holdings: [], totalUsd: 0, unpriced: 0, transfers: [], dao: null };
  const acct = await rpcQuery<{ amount: string }>({ request_type: "view_account", account_id: account });
  if (!acct) return { ...base, error: "Account not found" };
  const [full, dao, owned] = await Promise.all([
    getJson<{ pools?: Array<{ pool_id: string }>; tokens?: Array<{ contract_id: string; balance: string }> }>(`https://api.fastnear.com/v1/account/${account}/full`),
    readDao(account),
    view<string[]>("intents.near", "mt_tokens_for_owner", { account_id: account }),
  ]);
  const held: Array<{ contract: string; raw: string; intents: boolean }> = (full?.tokens ?? []).filter((t) => t.balance && t.balance !== "0").slice(0, 60).map((t) => ({ contract: t.contract_id, raw: t.balance, intents: false }));
  const ids = (owned ?? []).filter((t) => t.startsWith("nep141:")).slice(0, 30);
  if (ids.length) {
    const bal = await view<string[]>("intents.near", "mt_batch_balance_of", { account_id: account, token_ids: ids });
    ids.forEach((t, i) => { if (bal?.[i] && bal[i] !== "0") held.push({ contract: t.slice(7), raw: bal[i], intents: true }); });
  }
  const prices = await pricesOf(held.map((h) => h.contract));
  const near = nearUsd ?? null;
  const holdings: TreasuryHolding[] = [];
  const nearBal = units(acct.amount, 24);
  if (nearBal > 0) holdings.push({ id: "near", symbol: "NEAR", name: "NEAR", amount: nearBal, priceUsd: near, usd: near ? nearBal * near : null, logo: null, kind: "native", url: base.url });
  // Staked NEAR: what each validator pool the account has joined reports as its balance (staked + unstaked).
  await Promise.all((full?.pools ?? []).slice(0, 5).map(async (p) => {
    const tot = await view<string>(p.pool_id, "get_account_total_balance", { account_id: account });
    const n = tot ? units(tot, 24) : 0;
    if (n > 0) holdings.push({ id: `stake-${p.pool_id}`, symbol: "NEAR", name: `Staked with ${p.pool_id}`, amount: n, priceUsd: near, usd: near ? n * near : null, logo: null, kind: "staked", url: `${NB}/address/${p.pool_id}` });
  }));
  let unpriced = 0;
  await Promise.all(held.map(async (h) => {
    const px = prices.get(h.contract);
    if (!px) { unpriced++; return; }
    const m = await metaOf(h.contract);
    if (!m) { unpriced++; return; }
    const amount = units(h.raw, m.decimals), usd = amount * px.usd;
    if (usd < 0.01) return;
    holdings.push({ id: `${h.intents ? "mt:" : ""}${h.contract}`, symbol: m.symbol, name: h.intents ? `${m.name} in NEAR Intents` : m.name, amount, priceUsd: px.usd, usd, logo: m.icon ?? px.logo, kind: h.intents ? "intents" : "ft", url: `${NB}/token/${h.contract}` });
  }));
  holdings.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  const px = (k: string) => (k === "NEAR" ? near : prices.get(k)?.usd ?? null);
  const transfers = await readTransfers(account, px);
  return { ...base, kind: dao ? "dao" : "account", holdings, totalUsd: holdings.reduce((s, h) => s + (h.usd ?? 0), 0), unpriced, transfers, dao };
}

// ---------- entry, cached ----------

const cache = new Map<string, { at: number; p: Promise<TreasuryData> }>();

export function readTreasury(accounts: string[]): Promise<TreasuryData> {
  const list = [...new Set(accounts.map((a) => a.trim().toLowerCase()).filter(validAccount))].slice(0, 3);
  const key = list.join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = (async () => {
    const nearUsd = (await pricesOf(["wrap.near"])).get("wrap.near")?.usd ?? null;
    const accs = await Promise.all(list.map((a) => readAccount(a, nearUsd).catch((): TreasuryAccount => ({ account: a, url: `${NB}/address/${a}`, kind: "account", holdings: [], totalUsd: 0, unpriced: 0, transfers: [], dao: null, error: "Couldn't read this account right now" }))));
    return { accounts: accs, totalUsd: accs.reduce((s, a) => s + a.totalUsd, 0), at: Date.now() };
  })();
  cache.set(key, { at: Date.now(), p });
  // A read that came back empty-handed isn't kept for the full minute.
  void p.then((d) => { if (d.accounts.every((a) => a.error)) cache.delete(key); }, () => cache.delete(key));
  if (cache.size > 200) for (const [k, v] of cache) if (Date.now() - v.at > TTL) cache.delete(k);
  return p;
}

/** NEAR accounts named in free text: Sputnik DAOs anywhere, other .near names only right after treasury/DAO/multisig words. */
export function treasuryAccountsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/\b[a-z0-9][a-z0-9_-]*\.sputnik-dao\.near\b/g)) out.add(m[0]);
  for (const m of text.toLowerCase().matchAll(/\b(?:treasury|dao|multisig|wallet)(?:\s+(?:account|address))?(?:\s+is|:)?\s+@?([a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.near)\b/g)) out.add(m[1]);
  return [...out].filter(validAccount).slice(0, 3);
}
