import { activePlan, getUser, readCreditUse, spendPackCredits, writeCreditUse, type User } from "./accounts";
import { teamsOf } from "./teams";
import { runMeter, type Meter } from "./meter";
import { ANON_CREDITS_PER_DAY, START_CREDITS, plan, type PlanId } from "./plans";

// AI credits: who pays for a build or an edit, what they have left, and charging what it really cost.
//
//  - The payer is the account whose plan covers the work: a signed-in person's own plan, or the team plan they work
//    under (the team owner's shared pool). Signed-out visitors share a small daily pool per network address.
//  - Before a run, reserve() checks there's enough left and holds a little, so a burst of parallel requests can't all
//    start on the last credit. After it, settle() charges the measured cost: the period's allowance first, then packs.
//  - A payer who is out of credits but has their own model key keeps working on that key alone (our keys are off).
//  - Nothing is ever lent: an over-run past the last credit is absorbed, never owed.

const DAY = 86_400_000;
const PERIOD = 30 * DAY;

export interface Payer {
  /** Ledger key: user:<id> or ip:<address>. */
  who: string;
  plan: PlanId;
  /** The account packs are spent from (none for signed-out visitors). */
  userId?: string;
  /** Credits per period. */
  allowance: number;
  per: "day" | "month";
  /** Ledger period id: the UTC day, or which 30-day stretch of the paid plan. */
  period: string;
  resetsAt: number;
}

function periodOf(per: "day" | "month", planUntil: number | undefined, now = Date.now()): { period: string; resetsAt: number } {
  if (per === "day" || !planUntil) {
    const d = new Date(now).toISOString().slice(0, 10);
    return { period: d, resetsAt: Date.parse(`${d}T00:00:00Z`) + DAY };
  }
  // Stretches count back from the plan's end, so a renewal starts a fresh one and a yearly plan gets twelve.
  const left = Math.max(0, planUntil - now);
  const i = Math.floor(left / PERIOD);
  return { period: `${planUntil}-${i}`, resetsAt: Math.min(planUntil, now + (left % PERIOD || PERIOD)) };
}

function payerFromUser(u: User, p: PlanId): Payer {
  const pl = plan(p);
  return { who: `user:${u.id}`, plan: p, userId: u.id, allowance: pl.credits, per: pl.per, ...periodOf(pl.per, p === "free" ? undefined : u.planUntil) };
}

/** Who pays for work done by `u` (or by a signed-out visitor at `ip`). */
export async function payerFor(u: User | null, ip: string): Promise<Payer> {
  if (!u) return { who: `ip:${ip}`, plan: "free", allowance: ANON_CREDITS_PER_DAY, per: "day", ...periodOf("day", undefined) };
  const own = activePlan(u);
  if (own !== "free") return payerFromUser(u, own);
  // Working under someone's team plan: that team's shared pool pays.
  for (const t of await teamsOf(u.id)) {
    if (t.ownerId === u.id) continue;
    const owner = await getUser(t.ownerId);
    if (owner && activePlan(owner) === "team") return payerFromUser(owner, "team");
  }
  return payerFromUser(u, "free");
}

/** Edits are paid by the project's owner (their plan also picks the models); signed-out projects by the visitor. */
export async function payerForProject(ownerId: string | undefined, ip: string): Promise<Payer> {
  return payerFor(ownerId ? await getUser(ownerId) : null, ip);
}

// ---- the ledger: one writer per payer at a time (one server process), so concurrent settles don't lose a charge ----

const chains = new Map<string, Promise<unknown>>();
function locked<T>(who: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(who) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(who, next.catch(() => undefined));
  void next.finally(() => { if (chains.get(who) === next) chains.delete(who); }).catch(() => undefined);
  return next;
}

/** Credits held by requests still running. */
const held = new Map<string, number>();

const usedUsd = async (p: Payer) => { const r = await readCreditUse(p.who); return r?.period === p.period ? r.usd : 0; };
const packsOf = async (p: Payer) => (p.userId ? (await getUser(p.userId))?.credits ?? 0 : 0);
const round = (n: number) => Math.round(n * 100) / 100;

export interface Balance { plan: PlanId; allowance: number; per: "day" | "month"; used: number; left: number; packs: number; total: number; resetsAt: number }

export async function balance(p: Payer): Promise<Balance> {
  const used = round((await usedUsd(p)) * 100);
  const packs = round(await packsOf(p));
  const left = round(Math.max(0, p.allowance - used));
  return { plan: p.plan, allowance: p.allowance, per: p.per, used, left, packs, total: round(left + packs), resetsAt: p.resetsAt };
}

export interface Ticket { payer: Payer; hold: number }

/** Holds the credits a request needs to start, or null when there aren't enough left. */
export async function reserve(p: Payer, kind: keyof typeof START_CREDITS): Promise<Ticket | null> {
  return locked(p.who, async () => {
    const need = START_CREDITS[kind];
    const b = await balance(p);
    if (b.total - (held.get(p.who) ?? 0) < need) return null;
    held.set(p.who, (held.get(p.who) ?? 0) + need);
    return { payer: p, hold: need };
  });
}

/** Charges what the run really cost (USD), releases the hold. Allowance first, then packs. */
export async function settle(t: Ticket, usd: number): Promise<void> {
  await locked(t.payer.who, async () => {
    const h = (held.get(t.payer.who) ?? 0) - t.hold;
    if (h > 0.0001) held.set(t.payer.who, h); else held.delete(t.payer.who);
    if (!(usd > 0)) return;
    const before = await usedUsd(t.payer);
    await writeCreditUse(t.payer.who, { period: t.payer.period, usd: before + usd });
    // The part past the period's allowance comes out of packs.
    const cap = t.payer.allowance / 100;
    const over = Math.max(0, before + usd - Math.max(cap, before));
    if (over > 0 && t.payer.userId) await spendPackCredits(t.payer.userId, round(over * 100));
  });
}

/** The refusal a route sends when the payer is out. */
export function outOfCredits(p: Payer): Response {
  const when = p.per === "day" ? "tomorrow (UTC)" : `on ${new Date(p.resetsAt).toISOString().slice(0, 10)}`;
  const error = p.userId
    ? `You're out of AI credits. They come back ${when}. Top up with a credit pack${p.plan === "free" ? ", go Pro" : ""}, or add your own model key in Settings to keep going for free.`
    : `You've used today's free AI credits. Sign in for more, or come back tomorrow.`;
  return Response.json({ error, limit: true, credits: true, upgrade: p.plan === "free" ? "pro" : undefined, topup: !!p.userId || undefined }, { status: 429 });
}

/**
 * Runs fn as metered work for payer p. own: the work can run on the owner's own model key, so an empty balance
 * switches our keys off instead of refusing. Returns fn's value, or a refusal Response.
 */
export async function metered<T>(p: Payer, kind: keyof typeof START_CREDITS, own: boolean, fn: () => Promise<T>): Promise<{ value: T } | { refused: Response }> {
  const t = await reserve(p, kind);
  if (!t && !own) return { refused: outOfCredits(p) };
  const m: Meter = { usd: 0, ours: !!t };
  try {
    return { value: await runMeter(m, fn) };
  } finally {
    if (t) await settle(t, m.usd);
  }
}
