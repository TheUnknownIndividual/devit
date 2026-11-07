import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { listProjects, updateProject } from "./store";
import { seal, sha256, token, unseal } from "./secrets";
import { KEY_IDS, type KeyId, type OwnerKeys } from "./keyscope";
import type { Cycle, PlanId } from "./plans";
import type { Chain } from "./spec";

// Accounts as JSON files under data/accounts, like projects. No third-party auth: passkeys, wallet signatures and
// email codes each prove one sign-in method, and an account can hold several. Sessions are random tokens in an
// httpOnly cookie, stored only as their SHA-256.
//
//   users/<id>.json          the account, its methods, sealed API keys and plan
//   methods/<sha>.json       sign-in method → account id
//   sessions/<sha>.json      session token hash → account id, expiry
//   challenges/<key>.json    one-time nonces and codes (taken once, then deleted)
//   usage/<sha>.json         builds today, per account or anonymous browser

const ROOT = path.join(process.cwd(), "data", "accounts");
export const SESSION_COOKIE = "ss_session";
export const ANON_COOKIE = "ss_anon";
const SESSION_DAYS = 30;

export type MethodKind = "passkey" | "email" | "google" | "apple" | "github" | "solana" | "evm" | "near";
export interface Method {
  kind: MethodKind;
  /** Credential id, lowercased email, Google account id (sub), or wallet address / account id. */
  id: string;
  label: string;
  at: number;
  /** A verified email the provider vouched for (GitHub), used when the label is a username. */
  email?: string;
  passkey?: { publicKey: string; counter: number; transports?: string[] };
}
/** A remote MCP server the person connected (lib/mcp.ts). The agent reads from its read-only tools while it plans, answers and edits. */
export interface StoredConnector {
  id: string; name: string; url: string; header?: string; enc?: string; last4?: string;
  tools?: Array<{ name: string; description: string; readOnly: boolean }>;
  at: number; checkedAt: number; error?: string;
}
export interface StoredKey { enc: string; last4: string; host?: string; at: number; verifiedAt: number | null; use: boolean }
/** status is 1-Click's word for the deposit; received is the USDC it delivered; settledAt is set once, when the plan turned on. */
export interface Payment { depositAddress: string; plan: PlanId; cycle: Cycle; usd: number; pay: string; at: number; status?: string; received?: number; settledAt?: number; checkedAt?: number }
/**
 * A domain bought through sitesmith (lib/domain-orders.ts). awaiting: deposit address handed out; paid: 1-Click
 * delivered the full amount; registering: Spaceship is registering it; live: registered and pointed at the site;
 * refund: paid but couldn't be bought (taken or the price rose), for the owner to refund by hand.
 */
export interface DomainOrder {
  depositAddress: string; domain: string; projectId: string; usd: number; cost: number; pay: string; refundTo: string; at: number;
  state: "awaiting" | "paid" | "registering" | "live" | "refund" | "closed";
  status?: string; received?: number; paidAt?: number; op?: string; opAt?: number; liveAt?: number; error?: string; checkedAt?: number;
}
/**
 * A credit pack bought through sitesmith (lib/credit-orders.ts). awaiting: deposit address handed out; paid: 1-Click
 * delivered the full amount and the builds were added (once, in the same write); refund: arrived short or to the
 * wrong account, for the owner to refund by hand; closed: refunded, failed or abandoned.
 */
export interface CreditOrder {
  depositAddress: string; pack: string; credits: number; usd: number; pay: string; refundTo: string; at: number;
  state: "awaiting" | "paid" | "refund" | "closed";
  status?: string; received?: number; paidAt?: number; error?: string; checkedAt?: number;
}
/** A plan set by hand (support, testing): who set it and for how long. */
export interface Grant { plan: PlanId; days: number | null; by: string; at: number }
export interface User {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: number;
  methods: Method[];
  keys: Partial<Record<KeyId, StoredKey>>;
  /** Connectors (MCP) follow the person across projects; max 8. */
  connectors?: StoredConnector[];
  plan: PlanId;
  planUntil?: number;
  payments?: Payment[];
  domainOrders?: DomainOrder[];
  /** AI credits from packs (1 credit = $0.01 of model cost); spent after the plan's own credits for the period. */
  credits?: number;
  creditOrders?: CreditOrder[];
  grants?: Grant[];
  /** The picture the sign-in provider gave us (Google); shown unless the user uploaded their own. */
  picture?: string | null;
  /** A picture the user uploaded in Settings (/api/avatar/<id>); wins over everything. */
  avatar?: string | null;
  /** GitHub connected for code export: the sealed OAuth token and the scopes it was granted. */
  github?: { id: number; login: string; enc: string; scopes: string[]; at: number };
}

// ---------- files ----------

const safe = (rel: string) => { if (!/^[a-z]+\/[A-Za-z0-9_-]{6,128}\.json$/.test(rel)) throw new Error("bad account path"); return path.join(ROOT, rel); };

async function readJson<T>(rel: string): Promise<T | null> {
  try { return JSON.parse(await readFile(safe(rel), "utf8")) as T; } catch { return null; }
}

async function writeJson(rel: string, v: unknown): Promise<void> {
  const f = safe(rel);
  await mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${token(4)}.tmp`;
  await writeFile(tmp, JSON.stringify(v), { mode: 0o600 });
  await rename(tmp, f);
}

const drop = (rel: string) => rm(safe(rel), { force: true });

// ---------- users ----------

const locks = new Map<string, Promise<unknown>>();
const methodKey = (kind: MethodKind, id: string) => `methods/${sha256(`${kind}:${id}`)}.json`;
const newUserId = () => token(12).replace(/[^A-Za-z0-9]/g, "").slice(0, 14).padEnd(14, "x");

export const getUser = (id: string) => (/^[A-Za-z0-9]{6,32}$/.test(id) ? readJson<User>(`users/${id}.json`) : Promise.resolve(null));

export async function updateUser(id: string, fn: (u: User) => void | Promise<void>): Promise<User | null> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const u = await getUser(id);
    if (!u) return null;
    await fn(u);
    await writeJson(`users/${id}.json`, u);
    return u;
  });
  locks.set(id, next.catch(() => undefined));
  return next;
}

export async function userByMethod(kind: MethodKind, id: string): Promise<User | null> {
  const ref = await readJson<{ userId: string }>(methodKey(kind, id));
  return ref ? getUser(ref.userId) : null;
}

async function createUser(m: Method): Promise<User> {
  const u: User = { id: newUserId(), name: null, email: m.kind === "email" ? m.id : m.email ?? ((m.kind === "google" || m.kind === "apple") && m.label.includes("@") ? m.label : null), createdAt: Date.now(), methods: [m], keys: {}, plan: "free" };
  await writeJson(`users/${u.id}.json`, u);
  await writeJson(methodKey(m.kind, m.id), { userId: u.id });
  return u;
}

export async function addMethod(userId: string, m: Method): Promise<User | null> {
  const u = await updateUser(userId, (u) => {
    u.methods = [...u.methods.filter((x) => !(x.kind === m.kind && x.id === m.id)), m];
    if (m.kind === "email" && !u.email) u.email = m.id;
    if ((m.kind === "google" || m.kind === "apple") && !u.email && m.label.includes("@")) u.email = m.label;
    if (m.email && !u.email) u.email = m.email;
  });
  if (u) await writeJson(methodKey(m.kind, m.id), { userId });
  return u;
}

export async function removeMethod(userId: string, kind: MethodKind, id: string): Promise<User | null | "last"> {
  const u = await getUser(userId);
  if (!u) return null;
  if (u.methods.length <= 1) return "last";
  const out = await updateUser(userId, (u) => {
    u.methods = u.methods.filter((x) => !(x.kind === kind && x.id === id));
    if (kind === "email" && u.email === id) u.email = u.methods.find((x) => x.kind === "email")?.id ?? null;
  });
  await drop(methodKey(kind, id));
  return out;
}

/** The plan in force: a paid one lapses back to Free when its time runs out. */
export const activePlan = (u: User | null): PlanId => (!u || (u.planUntil && u.planUntil < Date.now()) ? "free" : u.plan);

export function initialOf(u: Pick<User, "name" | "email" | "methods">): string {
  const s = u.name || u.email || u.methods[0]?.label || "?";
  return (s.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
}

/** What the generated picture is drawn from: the first wallet (so it matches MetaMask's icon for that address), else the account id. */
export function avatarSeed(u: Pick<User, "id" | "methods">): string {
  return u.methods.find((m) => m.kind === "evm")?.id ?? u.methods.find((m) => m.kind === "solana" || m.kind === "near")?.id ?? u.id;
}

/** What the browser may know about an account: never sealed keys or passkey material. */
export function publicUser(u: User) {
  return {
    id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, initial: initialOf(u),
    avatar: u.avatar ?? u.picture ?? null, ownAvatar: !!u.avatar, avatarSeed: avatarSeed(u), plan: activePlan(u), planUntil: u.planUntil ?? null,
    payments: (u.payments ?? []).map((x) => ({ depositAddress: x.depositAddress, plan: x.plan, cycle: x.cycle, usd: x.usd, pay: x.pay, at: x.at, status: x.status ?? null, received: x.received ?? null, settledAt: x.settledAt ?? null })),
    credits: u.credits ?? 0,
    creditOrders: (u.creditOrders ?? []).map((o) => ({ depositAddress: o.depositAddress, pack: o.pack, credits: o.credits, usd: o.usd, pay: o.pay, at: o.at, state: o.state, status: o.status ?? null, received: o.received ?? null, error: o.error ?? null })),
    github: u.github ? { login: u.github.login, canPush: u.github.scopes.includes("repo") || u.github.scopes.includes("public_repo"), at: u.github.at } : null,
    grants: (u.grants ?? []).map((g) => ({ plan: g.plan, days: g.days, at: g.at })),
    methods: u.methods.map((m) => ({ kind: m.kind, id: m.kind === "passkey" ? m.id.slice(0, 12) : m.id, fullId: m.id, label: m.label, at: m.at })),
    keys: Object.fromEntries(Object.entries(u.keys).map(([k, v]) => [k, { last4: v!.last4, host: v!.host ?? null, at: v!.at, verifiedAt: v!.verifiedAt, use: v!.use }])) as Partial<Record<KeyId, { last4: string; host: string | null; at: number; verifiedAt: number | null; use: boolean }>>,
  };
}
export type PublicUser = ReturnType<typeof publicUser>;

// ---------- sessions ----------

async function jar() { return cookies(); }
const secure = () => process.env.NODE_ENV === "production";

export async function startSession(userId: string): Promise<void> {
  const t = token(32);
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  await writeJson(`sessions/${sha256(t)}.json`, { userId, at: Date.now(), exp });
  const c = await jar();
  c.set(SESSION_COOKIE, t, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
  const anon = c.get(ANON_COOKIE)?.value;
  if (anon) await claimAnon(userId, sha256(anon));
}

export async function endSession(): Promise<void> {
  const c = await jar();
  const t = c.get(SESSION_COOKIE)?.value;
  if (t) await drop(`sessions/${sha256(t)}.json`).catch(() => undefined);
  c.delete(SESSION_COOKIE);
}

export interface Viewer { user: User | null; anon: string | null }

/** Who is asking: the signed-in account (if any) and the hash of this browser's anonymous id (if any). */
export async function viewer(): Promise<Viewer> {
  const c = await jar();
  const t = c.get(SESSION_COOKIE)?.value;
  const a = c.get(ANON_COOKIE)?.value;
  let user: User | null = null;
  if (t && t.length < 100) {
    const s = await readJson<{ userId: string; exp: number }>(`sessions/${sha256(t)}.json`);
    if (s && s.exp > Date.now()) user = await getUser(s.userId);
  }
  return { user, anon: a && a.length < 100 ? sha256(a) : null };
}

/** The anonymous id hash for this browser, setting the cookie the first time. */
export async function ensureAnon(): Promise<string> {
  const c = await jar();
  let a = c.get(ANON_COOKIE)?.value;
  if (!a || a.length > 100) {
    a = token(24);
    c.set(ANON_COOKIE, a, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  }
  return sha256(a);
}

// ---------- projects ----------

async function claimAnon(userId: string, anon: string): Promise<void> {
  for (const p of await listProjects(500)) {
    if (!p.ownerId && p.anon === anon) await updateProject(p.id, (q) => { if (!q.ownerId && q.anon === anon) q.ownerId = userId; });
  }
}

// ---------- sign-in methods ----------

/**
 * One method proven (passkey, signature, code). Signed in: link it to this account. Signed out: sign in to the account
 * that has it, or make a new account.
 */
export async function completeMethod(m: Method): Promise<{ user: User; linked: boolean } | { error: string }> {
  const v = await viewer();
  const owner = await userByMethod(m.kind, m.id);
  if (v.user) {
    if (owner && owner.id !== v.user.id) return { error: "That sign-in already belongs to another account. Sign out and use it there." };
    const u = owner ? v.user : await addMethod(v.user.id, m);
    return { user: u ?? v.user, linked: true };
  }
  const user = owner ?? (await createUser(m));
  await startSession(user.id);
  return { user, linked: false };
}

// ---------- challenges ----------

export async function putChallenge(key: string, data: unknown, ttlMs: number): Promise<void> {
  await writeJson(`challenges/${key}.json`, { data, exp: Date.now() + ttlMs });
}

/** Reads and deletes in one go, so a nonce or code can be used once. */
export async function takeChallenge<T>(key: string): Promise<T | null> {
  const c = await readJson<{ data: T; exp: number }>(`challenges/${key}.json`);
  await drop(`challenges/${key}.json`).catch(() => undefined);
  return c && c.exp > Date.now() ? c.data : null;
}

export async function peekChallenge<T>(key: string): Promise<T | null> {
  const c = await readJson<{ data: T; exp: number }>(`challenges/${key}.json`);
  return c && c.exp > Date.now() ? c.data : null;
}

/** The site's own origin and host for WebAuthn and wallet messages. WEBAUTHN_ORIGIN / WEBAUTHN_RP_ID override it. */
export function siteOrigin(req: Request): { origin: string; host: string; rpID: string } | null {
  const fixed = process.env.WEBAUTHN_ORIGIN?.trim();
  const raw = fixed || req.headers.get("origin");
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  // Without a fixed origin, the browser's Origin has to be the host it's talking to.
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!fixed && host !== u.host) return null;
  return { origin: u.origin, host: u.host, rpID: process.env.WEBAUTHN_RP_ID?.trim() || u.hostname };
}

/** Drops expired challenges now and then so the folder doesn't grow. */
export async function sweepChallenges(): Promise<void> {
  if (Math.random() > 0.05) return;
  try {
    for (const n of await readdir(path.join(ROOT, "challenges"))) {
      const c = await readJson<{ exp: number }>(`challenges/${n}`);
      if (!c || c.exp < Date.now()) await drop(`challenges/${n}`);
    }
  } catch { /* none yet */ }
}

// ---------- usage ----------

const today = () => new Date().toISOString().slice(0, 10);

export async function buildsToday(who: string): Promise<number> {
  const u = await readJson<{ day: string; builds: number }>(`usage/${sha256(who)}.json`);
  return u?.day === today() ? u.builds : 0;
}

export async function countBuild(who: string): Promise<void> {
  const n = await buildsToday(who);
  await writeJson(`usage/${sha256(who)}.json`, { day: today(), builds: n + 1 });
}

// ---------- AI credits ----------

/** Model spend in a credit period, per payer (lib/credits.ts keeps the arithmetic). */
export async function readCreditUse(who: string): Promise<{ period: string; usd: number } | null> {
  return readJson(`usage/credits-${sha256(who)}.json`);
}
export async function writeCreditUse(who: string, v: { period: string; usd: number }): Promise<void> {
  await writeJson(`usage/credits-${sha256(who)}.json`, v);
}

/** Takes up to `credits` from the account's pack balance, under the account lock; never below zero. */
export async function spendPackCredits(userId: string, credits: number): Promise<void> {
  if (!(credits > 0)) return;
  await updateUser(userId, (u) => { u.credits = Math.max(0, Math.round(((u.credits ?? 0) - credits) * 100) / 100); });
}

// ---------- API keys ----------

export async function saveKey(userId: string, id: KeyId, secret: string, host?: string): Promise<User | null> {
  return updateUser(userId, (u) => {
    u.keys[id] = { enc: seal(secret), last4: secret.slice(-4), host, at: Date.now(), verifiedAt: Date.now(), use: true };
  });
}

export function keyOf(u: User, id: KeyId): string | null {
  const k = u.keys[id];
  return k ? unseal(k.enc) : null;
}

/** The owner's keys that are switched on, ready for runWithKeys. */
export async function ownerKeysFor(ownerId: string | undefined): Promise<OwnerKeys | null> {
  if (!ownerId) return null;
  const u = await getUser(ownerId);
  if (!u) return null;
  const out: OwnerKeys = {};
  for (const id of KEY_IDS) {
    if (!u.keys[id]?.use) continue;
    const v = keyOf(u, id);
    if (!v) continue;
    if (id.startsWith("rpc:")) out.rpc = { ...out.rpc, [id.slice(4) as Chain]: v };
    else out[id as Exclude<KeyId, `rpc:${string}`>] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** A connector as the browser sees it: never the secret. */
export const connectorView = (c: StoredConnector) => ({
  id: c.id, name: c.name, host: new URL(c.url).host, header: c.header ?? null, last4: c.last4 ?? null, at: c.at, checkedAt: c.checkedAt,
  error: c.error ?? null, tools: c.tools ?? [],
});
