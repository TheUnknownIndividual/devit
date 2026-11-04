// Sets an account's plan by hand, for support and testing: pnpm grant-plan <email-or-userId> <free|pro|team> [days]
// Pro/Team default to 30 days from now; free ends any plan. Run from the app folder, so data/ is the live one.
import { findUser, grantPlan } from "../src/lib/billing";
import { activePlan } from "../src/lib/accounts";

const [who, planId, days] = process.argv.slice(2);
if (!who || !["free", "pro", "team"].includes(planId ?? "") || (days && !(Number(days) >= 1))) {
  console.error("usage: pnpm grant-plan <email-or-userId> <free|pro|team> [days]");
  process.exit(1);
}
const u = await findUser(who);
if (!u) { console.error(`no account for ${who}`); process.exit(1); }
const out = (await grantPlan(u.id, planId as "free" | "pro" | "team", days ? Math.floor(Number(days)) : null, "cli"))!;
console.log(`${out.id} (${out.email ?? out.name ?? "no email"}): ${activePlan(out)}${out.planUntil ? ` until ${new Date(out.planUntil).toISOString().slice(0, 10)}` : ""}`);
