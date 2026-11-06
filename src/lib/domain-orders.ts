import { getUser, updateUser, type DomainOrder } from "./accounts";
import { covers, delivered, fetchStatus } from "./billing";
import { cfEnabled, cfEnsure, cfRemove, customTarget, newDomain } from "./domains";
import { getProject, updateProject } from "./store";
import { syncRouting } from "./routing";
import { buyingOn, operation, ourKey, pointingRecords, quoteDomain, registerDomain, writeRecords } from "./spaceship";

// Moving a domain order along, one step per call; safe to call any number of times (the builder polls it):
//   awaiting → paid        1-Click says SUCCESS and delivered at least the price to PAYMENTS_NEAR_ACCOUNT
//   paid → registering     still available at no more than we charged: register it on our Spaceship account
//   registering → live     Spaceship says success: write TXT + ALIAS/CNAME, attach it to the project, route it
//   paid → refund          taken meanwhile or now dearer than paid; the owner refunds by hand
// Registration spends our Spaceship balance, so it only happens with buyingOn() (DOMAIN_PURCHASES=live).

const DAY = 86_400_000;
const FINAL = new Set(["REFUNDED", "FAILED"]);

const find = (u: { domainOrders?: DomainOrder[] } | null, dep: string) => u?.domainOrders?.find((o) => o.depositAddress === dep) ?? null;

export async function advanceOrder(userId: string, dep: string): Promise<DomainOrder | null> {
  let o = find(await getUser(userId), dep);
  if (!o) return null;

  if (o.state === "awaiting") {
    if (Date.now() - o.at > 3 * DAY) return set(userId, dep, (x) => { x.state = "closed"; });
    const s = await fetchStatus(dep);
    const to = process.env.PAYMENTS_NEAR_ACCOUNT?.trim(), sentTo = s.quoteResponse?.quoteRequest?.recipient;
    o = await set(userId, dep, (x) => {
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
    });
    if (!o || o.state !== "paid") return o;
  }

  if (o.state === "paid") {
    if (!buyingOn()) return o;
    // Claim the registration step first, so two polls can never register (and pay for) the same name twice.
    let mine = false;
    o = await set(userId, dep, (x) => { if (x.state === "paid" && !x.opAt) { x.opAt = Date.now(); mine = true; } });
    if (!mine || !o) return o;
    const offer = await quoteDomain(o.domain);
    if (!offer || offer.price == null || offer.price > o.cost + 0.01) {
      return set(userId, dep, (x) => { x.state = "refund"; x.error = offer ? `The price went up to $${offer.price}.` : "Someone else registered it first."; x.opAt = undefined; });
    }
    const r = await registerDomain(o.domain);
    if ("error" in r) return set(userId, dep, (x) => { x.state = "refund"; x.error = `Spaceship refused: ${r.error}`; x.opAt = undefined; });
    o = await set(userId, dep, (x) => { x.state = "registering"; x.op = r.op; });
    if (!o) return o;
  }

  if (o.state === "registering" && o.op) {
    const st = await operation(o.op);
    if (st === "failed") return set(userId, dep, (x) => { x.state = "refund"; x.error = "Spaceship couldn't register it."; });
    if (st !== "success") return o;
    const err = await pointAtSite(o);
    return set(userId, dep, (x) => { if (err) x.error = err; else { x.state = "live"; x.liveAt = Date.now(); x.error = undefined; } });
  }
  return o;
}

/** Puts the bought domain on its project and writes the records on our Spaceship zone. Returns an error or null. */
async function pointAtSite(o: DomainOrder): Promise<string | null> {
  const target = customTarget(), k = ourKey();
  if (!target || !k) return "Custom domains aren't set up on this server.";
  const p = await getProject(o.projectId);
  if (!p) return "The project is gone; the domain is registered and kept for you.";
  const fresh = p.domain?.host === o.domain ? p.domain : newDomain(o.domain, true);
  if (p.domain && p.domain.host !== o.domain && p.domain.cf?.id) await cfRemove(p.domain.cf.id);
  const cf = cfEnabled() ? await cfEnsure(o.domain, fresh.cf?.id) : null;
  const cfOk = cf && !("error" in cf) ? cf : undefined;
  const w = await writeRecords(k, o.domain, pointingRecords(o.domain, o.domain, fresh.token, target, cfOk?.txt));
  if ("error" in w) return w.error;
  const q = await updateProject(o.projectId, (x) => { x.domain = { ...fresh, ...(cfOk ? { cf: cfOk } : {}) }; });
  if (q) await syncRouting(q);
  return null;
}

async function set(userId: string, dep: string, fn: (o: DomainOrder) => void): Promise<DomainOrder | null> {
  let out: DomainOrder | null = null;
  await updateUser(userId, (u) => { const x = find(u, dep); if (x) { fn(x); out = { ...x }; } });
  return out;
}

/** What the builder shows of an order. */
export const orderView = (o: DomainOrder) => ({
  depositAddress: o.depositAddress, domain: o.domain, usd: o.usd, pay: o.pay, at: o.at, state: o.state,
  status: o.status ?? null, received: o.received ?? null, error: o.error ?? null, waiting: o.state === "paid" && !buyingOn(),
});
