import { getUser, updateUser, type CreditOrder } from "./accounts";
import { covers, delivered, fetchStatus } from "./billing";

// Moving a credit-pack order along; safe to call any number of times (the pricing page polls it):
//   awaiting → paid      1-Click says SUCCESS and delivered at least the price to PAYMENTS_NEAR_ACCOUNT; the credits
//                        are added in the same locked write that flips the state, so they land exactly once
//   awaiting → refund    it arrived short or went somewhere else; the owner refunds by hand
//   awaiting → closed    refunded, failed, or nothing came within three days
// A pack is a plain prepaid purchase: no credit extended, nothing owed, and the credits never expire.

const DAY = 86_400_000;
const FINAL = new Set(["REFUNDED", "FAILED"]);

const find = (u: { creditOrders?: CreditOrder[] } | null, dep: string) => u?.creditOrders?.find((o) => o.depositAddress === dep) ?? null;

export async function advanceCreditOrder(userId: string, dep: string): Promise<CreditOrder | null> {
  const o = find(await getUser(userId), dep);
  if (!o || o.state !== "awaiting") return o;
  if (Date.now() - o.at > 3 * DAY) return set(userId, dep, (x) => { if (x.state === "awaiting") x.state = "closed"; });
  const s = await fetchStatus(dep);
  const to = process.env.PAYMENTS_NEAR_ACCOUNT?.trim(), sentTo = s.quoteResponse?.quoteRequest?.recipient;
  return set(userId, dep, (x, u) => {
    if (x.state !== "awaiting") return;
    x.status = s.status ?? x.status;
    x.checkedAt = Date.now();
    if (s.status && FINAL.has(s.status)) { x.state = "closed"; return; }
    if (s.status !== "SUCCESS") return;
    const got = delivered(s);
    if (got != null) x.received = Math.round(got * 100) / 100;
    if ((to && sentTo && sentTo !== to) || got == null || !covers(got, x.usd)) { x.state = "refund"; x.error = "The payment arrived short."; return; }
    x.state = "paid";
    x.paidAt = Date.now();
    u.credits = (u.credits ?? 0) + x.credits;
  });
}

async function set(userId: string, dep: string, fn: (o: CreditOrder, u: { credits?: number }) => void): Promise<CreditOrder | null> {
  let out: CreditOrder | null = null;
  await updateUser(userId, (u) => { const x = find(u, dep); if (x) { fn(x, u); out = { ...x }; } });
  return out;
}

/** Orders still worth asking 1-Click about. */
export const creditOrderOpen = (o: CreditOrder, now = Date.now()) => o.state === "awaiting" && now - o.at < 3 * DAY;

/** Asks about every open pack order at once, for at most budgetMs, so a page load doesn't wait on 1-Click. */
export async function sweepCreditOrders(userId: string, budgetMs = 2500): Promise<void> {
  const open = ((await getUser(userId))?.creditOrders ?? []).filter((o) => creditOrderOpen(o));
  if (!open.length) return;
  await Promise.race([Promise.all(open.map((o) => advanceCreditOrder(userId, o.depositAddress))), new Promise((r) => setTimeout(r, budgetMs))]);
}
