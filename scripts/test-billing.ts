// Plan activation from 1-Click statuses, against mocked replies (no network, no funds): pnpm test-billing
// Runs in a throwaway data folder, so the app's accounts are never touched.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "ss-billing-"));
process.chdir(tmp);
delete process.env.PAYMENTS_NEAR_ACCOUNT;
const { applyStatus, checkPayment, sweepPayments, grantPlan, findUser } = await import("../src/lib/billing");
const { activePlan, getUser } = await import("../src/lib/accounts");
type User = import("../src/lib/accounts").User;
type Status = import("../src/lib/billing").OneClickStatus;

const DAY = 86_400_000, now = Date.now();
const ok = (amount: string): Status => ({ status: "SUCCESS", swapDetails: { amountOutFormatted: amount } });
const pay = (dep: string, cycle: "monthly" | "yearly" = "monthly", usd = 20, at = now - 60_000) => ({ depositAddress: dep, plan: "pro" as const, cycle, usd, pay: "base:USDC", at });
const user = (id: string, extra: Partial<User> = {}): User => ({ id, name: null, email: `${id.toLowerCase()}@test.dev`, createdAt: now, methods: [], keys: {}, plan: "free", ...extra });
let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log(`ok  ${name}`); });

await t("SUCCESS, full amount: plan on for 30 days, payment settled", () => {
  const u = user("aaaaaa1", { payments: [pay("dep-full-0001")] });
  assert.equal(applyStatus(u, "dep-full-0001", ok("20.01"), now), "activated");
  assert.equal(u.plan, "pro");
  assert.equal(u.planUntil, now + 30 * DAY);
  assert.equal(u.payments![0].settledAt, now);
  assert.equal(u.payments![0].received, 20.01);
});

await t("SUCCESS again for the same deposit: no second activation", () => {
  const u = user("aaaaaa2", { payments: [pay("dep-dup-00001")] });
  applyStatus(u, "dep-dup-00001", ok("20"), now);
  const until = u.planUntil;
  assert.equal(applyStatus(u, "dep-dup-00001", ok("20"), now + 1000), "settled");
  assert.equal(u.planUntil, until);
});

await t("SUCCESS, under-paid: stays free, shown as short", () => {
  const u = user("aaaaaa3", { payments: [pay("dep-short-001")] });
  assert.equal(applyStatus(u, "dep-short-001", ok("19.50"), now), "short");
  assert.equal(activePlan(u), "free");
  assert.equal(u.payments![0].settledAt, undefined);
  assert.equal(u.payments![0].received, 19.5);
  assert.equal(u.payments![0].status, "SUCCESS");
});

await t("SUCCESS within 1% of the price: activates", () => {
  const u = user("aaaaaa4", { payments: [pay("dep-near-0001")] });
  assert.equal(applyStatus(u, "dep-near-0001", ok("19.81"), now), "activated");
  assert.equal(u.plan, "pro");
});

await t("SUCCESS in raw 6-decimal amountOut: read as USDC", () => {
  const u = user("aaaaaa5", { payments: [pay("dep-raw-00001")] });
  assert.equal(applyStatus(u, "dep-raw-00001", { status: "SUCCESS", swapDetails: { amountOut: "20000000" } }, now), "activated");
});

await t("SUCCESS without any amount: not activated", () => {
  const u = user("aaaaaa6", { payments: [pay("dep-none-0001")] });
  assert.equal(applyStatus(u, "dep-none-0001", { status: "SUCCESS" }, now), "short");
  assert.equal(activePlan(u), "free");
});

await t("REFUNDED and FAILED: closed, no plan", () => {
  const u = user("aaaaaa7", { payments: [pay("dep-refund-01"), pay("dep-failed-01")] });
  assert.equal(applyStatus(u, "dep-refund-01", { status: "REFUNDED" }, now), "closed");
  assert.equal(applyStatus(u, "dep-failed-01", { status: "FAILED" }, now), "closed");
  assert.equal(activePlan(u), "free");
});

await t("PENDING then SUCCESS: activates on the second reply", () => {
  const u = user("aaaaaa8", { payments: [pay("dep-pend-0001")] });
  assert.equal(applyStatus(u, "dep-pend-0001", { status: "PENDING_DEPOSIT" }, now), "pending");
  assert.equal(applyStatus(u, "dep-pend-0001", {}, now), "pending");
  assert.equal(applyStatus(u, "dep-pend-0001", ok("20"), now), "activated");
});

await t("Yearly on top of time left: extends from the current end", () => {
  const u = user("aaaaaa9", { plan: "pro", planUntil: now + 10 * DAY, payments: [pay("dep-year-0001", "yearly", 192)] });
  assert.equal(applyStatus(u, "dep-year-0001", ok("192"), now), "activated");
  assert.equal(u.planUntil, now + 375 * DAY);
});

await t("Lapsed plan: extends from now, not the old end", () => {
  const u = user("aaaaab1", { plan: "pro", planUntil: now - 5 * DAY, payments: [pay("dep-lapse-001")] });
  applyStatus(u, "dep-lapse-001", ok("20"), now);
  assert.equal(u.planUntil, now + 30 * DAY);
});

await t("Paid to someone else's account: not activated", () => {
  process.env.PAYMENTS_NEAR_ACCOUNT = "pay.sitesmith.near";
  const u = user("aaaaab2", { payments: [pay("dep-wrong-001")] });
  assert.equal(applyStatus(u, "dep-wrong-001", { ...ok("20"), quoteResponse: { quoteRequest: { recipient: "evil.near" } } }, now), "short");
  delete process.env.PAYMENTS_NEAR_ACCOUNT;
});

await t("Unknown deposit: ignored", () => {
  const u = user("aaaaab3", { payments: [pay("dep-mine-0001")] });
  assert.equal(applyStatus(u, "dep-other-001", ok("20"), now), "unknown");
  assert.equal(activePlan(u), "free");
});

// Through the account files, as the routes use it.
const save = (u: User) => { mkdirSync(path.join(tmp, "data/accounts/users"), { recursive: true }); writeFileSync(path.join(tmp, `data/accounts/users/${u.id}.json`), JSON.stringify(u)); };

await t("checkPayment, two polls at once for one deposit: activates once", async () => {
  save(user("bbbbbb1", { payments: [pay("dep-file-0001")] }));
  let calls = 0;
  const get = async () => { calls++; return ok("20"); };
  const [a, b] = await Promise.all([checkPayment("bbbbbb1", "dep-file-0001", get), checkPayment("bbbbbb1", "dep-file-0001", get)]);
  assert.deepEqual([a.outcome, b.outcome].sort(), ["activated", "settled"]);
  const u = (await getUser("bbbbbb1"))!;
  assert.equal(activePlan(u), "pro");
  assert.ok(Math.abs(u.planUntil! - (Date.now() + 30 * DAY)) < 5000);
  const again = await checkPayment("bbbbbb1", "dep-file-0001", get);
  assert.equal(again.outcome, "settled");
  assert.ok(calls <= 2);
});

await t("sweepPayments: asks only about open payments", async () => {
  save(user("bbbbbb2", { payments: [pay("dep-sw-open01"), { ...pay("dep-sw-done01"), status: "REFUNDED" }, pay("dep-sw-old001", "monthly", 20, now - 4 * DAY)] }));
  const asked: string[] = [];
  await sweepPayments("bbbbbb2", 2000, async (d) => { asked.push(d); return ok("20"); });
  assert.deepEqual(asked, ["dep-sw-open01"]);
  assert.equal(activePlan((await getUser("bbbbbb2"))!), "pro");
});

await t("grantPlan by id, then back to free", async () => {
  writeFileSync(path.join(tmp, "data/accounts/users/bbbbbb3.json"), JSON.stringify(user("bbbbbb3")));
  const byId = await findUser("bbbbbb3");
  assert.equal(byId?.id, "bbbbbb3");
  const g = (await grantPlan("bbbbbb3", "team", 7, "test"))!;
  assert.equal(activePlan(g), "team");
  assert.ok(Math.abs(g.planUntil! - (Date.now() + 7 * DAY)) < 5000);
  const f = (await grantPlan("bbbbbb3", "free", null, "test"))!;
  assert.equal(activePlan(f), "free");
  assert.equal(f.planUntil, undefined);
  assert.equal(f.grants?.length, 2);
});

console.log(`\n${n} passed (data in ${tmp})`);
