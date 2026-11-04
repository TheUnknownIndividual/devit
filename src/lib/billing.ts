import { getUser, updateUser, userByMethod, type User } from "./accounts";
import { cycleDays, type PlanId } from "./plans";

// Turning plan payments into plan time. A payment is a 1-Click deposit address from /api/billing; we only read its
// status, never move funds. A deposit turns the plan on once, when 1-Click says SUCCESS and the USDC it delivered
// covers the price (within 1%). Short payments stay on record as short.

const ONECLICK = process.env.ONECLICK_URL || "https://1click.chaindefuser.com";
const DAY = 86_400_000;
/** Statuses 1-Click won't move on from. */
const FINAL = new Set(["SUCCESS", "REFUNDED", "FAILED"]);
/** A quote's address is good for an hour; after this long without a final status we stop asking. */
const WATCH_MS = 3 * DAY;

export interface OneClickStatus {
  status?: string;
  swapDetails?: { amountOut?: string; amountOutFormatted?: string; amountOutUsd?: string };
  quoteResponse?: { quoteRequest?: { recipient?: string } };
}

export type Outcome = "activated" | "short" | "settled" | "pending" | "closed" | "unknown";

/** USDC delivered, in dollars. amountOut is in USDC's 6 decimals. */
export function delivered(s: OneClickStatus): number | null {
  const d = s.swapDetails;
  const n = d?.amountOutFormatted != null ? Number(d.amountOutFormatted) : d?.amountOut != null ? Number(d.amountOut) / 1e6 : d?.amountOutUsd != null ? Number(d.amountOutUsd) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const covers = (received: number, usd: number) => received >= usd * 0.99;

/** Folds one status reply into the account (mutates u). Safe to call any number of times for the same deposit. */
export function applyStatus(u: User, dep: string, s: OneClickStatus, now = Date.now()): Outcome {
  const x = u.payments?.find((y) => y.depositAddress === dep);
  if (!x) return "unknown";
  if (u.payments!.some((y) => y.depositAddress === dep && y.settledAt)) return "settled";
  if (!s.status) return "pending";
  x.status = s.status;
  x.checkedAt = now;
  if (s.status !== "SUCCESS") return FINAL.has(s.status) ? "closed" : "pending";
  const to = process.env.PAYMENTS_NEAR_ACCOUNT?.trim(), sentTo = s.quoteResponse?.quoteRequest?.recipient;
  if (to && sentTo && sentTo !== to) return "short";
  const got = delivered(s);
  if (got != null) x.received = Math.round(got * 100) / 100;
  if (got == null || !covers(got, x.usd)) return "short";
  u.plan = x.plan;
  u.planUntil = Math.max(now, u.planUntil ?? 0) + cycleDays(x.cycle) * DAY;
  x.settledAt = now;
  return "activated";
}

export async function fetchStatus(dep: string): Promise<OneClickStatus> {
  const headers: Record<string, string> = {};
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  return fetch(`${ONECLICK}/v0/status?depositAddress=${encodeURIComponent(dep)}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<OneClickStatus>) : {}))
    .catch(() => ({}));
}

type Fetcher = (dep: string) => Promise<OneClickStatus>;

/** Payments still worth asking about: not settled, not final, not long abandoned. */
export const isOpen = (x: NonNullable<User["payments"]>[number], now = Date.now()) => !x.settledAt && !FINAL.has(x.status ?? "") && now - x.at < WATCH_MS;

export async function checkPayment(userId: string, dep: string, get: Fetcher = fetchStatus): Promise<{ outcome: Outcome; user: User | null }> {
  const before = await getUser(userId);
  const x = before?.payments?.find((y) => y.depositAddress === dep);
  if (!before || !x) return { outcome: "unknown", user: before };
  if (x.settledAt) return { outcome: "settled", user: before };
  if (!isOpen(x)) return { outcome: x.status === "SUCCESS" ? "short" : "closed", user: before };
  const s = await get(dep);
  let outcome: Outcome = "pending";
  const user = await updateUser(userId, (u) => { outcome = applyStatus(u, dep, s); });
  return { outcome, user };
}

/** Asks about every open payment at once, for at most budgetMs, so a page load doesn't wait on 1-Click. */
export async function sweepPayments(userId: string, budgetMs = 2500, get: Fetcher = fetchStatus): Promise<void> {
  const u = await getUser(userId);
  const open = (u?.payments ?? []).filter((x) => isOpen(x));
  if (!open.length) return;
  await Promise.race([Promise.all(open.map((x) => checkPayment(userId, x.depositAddress, get))), new Promise((r) => setTimeout(r, budgetMs))]);
}

// ---------- admin ----------

/** ADMINS: comma-separated account ids or emails. */
export function isAdmin(u: User | null): boolean {
  if (!u) return false;
  const list = (process.env.ADMINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.some((a) => a === u.id || (!!u.email && a.toLowerCase() === u.email.toLowerCase()));
}

export async function findUser(idOrEmail: string): Promise<User | null> {
  const s = idOrEmail.trim();
  return s.includes("@") ? userByMethod("email", s.toLowerCase()) : getUser(s);
}

/** Sets a plan by hand: pro/team for `days` (default 30) from now, or back to Free. */
export async function grantPlan(userId: string, planId: PlanId, days: number | null, by: string): Promise<User | null> {
  const d = planId === "free" ? null : days ?? 30;
  return updateUser(userId, (u) => {
    u.plan = planId;
    u.planUntil = d ? Date.now() + d * DAY : undefined;
    u.grants = [...(u.grants ?? []).slice(-19), { plan: planId, days: d, by, at: Date.now() }];
  });
}
