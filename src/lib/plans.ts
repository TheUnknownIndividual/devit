// Plans and prices in one place; the pricing page, the pay button and the limits all read from here.
//
// Every plan comes with AI credits. 1 credit = $0.01 of what the models cost us at list price, measured from each
// reply (lib/meter.ts), so a heavy model, a retry or a long site all cost what they really cost. That keeps every plan
// in profit at full use: Pro's 800 credits are at most $8 of model spend on $16-20, Team's 2,000 at most $20 on
// $39-49, packs sell at 1.5-2x cost. Builds and edits on a person's own model key spend no credits at all.

export type PlanId = "free" | "pro" | "team";
export type Cycle = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  /** USD per month, billed monthly. */
  monthly: number;
  /** USD per month when billed yearly. */
  yearly: number;
  /** AI credits each period: a day on Free, a 30-day stretch of the paid plan on Pro and Team. */
  credits: number;
  per: "day" | "month";
  seats: number;
  perks: string[];
}

/** Rough sizes, for the copy: a site build is 3-8 credits, a chat edit well under 1 on small models. */
export const TYPICAL = { buildLow: 3, buildHigh: 8, edit: 0.5 };

export const PLANS: Plan[] = [
  {
    id: "free", name: "Free", blurb: "Launch a site and see it live.", monthly: 0, yearly: 0, credits: 15, per: "day", seats: 1,
    perks: ["15 AI credits a day (about 3 builds plus edits)", "Hosting on a devit.lol subdomain", "“Built with sitesmith” footer", "Unlimited use on your own model key"],
  },
  {
    id: "pro", name: "Pro", blurb: "For teams shipping a token for real.", monthly: 20, yearly: 16, credits: 800, per: "month", seats: 1,
    perks: ["800 AI credits a month (100+ builds, or thousands of edits)", "Custom domain, or buy one in the builder", "No sitesmith footer", "Private projects", "Priority models and build queue"],
  },
  {
    id: "team", name: "Team", blurb: "One workspace for the whole crew.", monthly: 49, yearly: 39, credits: 2000, per: "month", seats: 5,
    perks: ["Everything in Pro", "2,000 shared AI credits a month", "5 seats", "Shared projects", "Roles: owner, editor, viewer"],
  },
];

/** Signed-out visitors share a smaller daily allowance per network, so clearing cookies doesn't mint new credits. */
export const ANON_CREDITS_PER_DAY = 8;

export const plan = (id: PlanId | undefined): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** What one payment covers, in USD. */
export const priceUsd = (p: Plan, cycle: Cycle) => (cycle === "yearly" ? p.yearly * 12 : p.monthly);

/** Days one payment adds to a plan. */
export const cycleDays = (cycle: Cycle) => (cycle === "yearly" ? 365 : 30);

/**
 * Credit packs: extra AI credits paid for up front, spent only once the plan's own credits for the period are gone,
 * on any plan. A pack is a plain prepaid purchase: no borrowing ahead, no interest, and the credits never expire.
 */
export interface CreditPack { id: string; credits: number; usd: number }
export const CREDIT_PACKS: CreditPack[] = [
  { id: "credits-250", credits: 250, usd: 5 },
  { id: "credits-1000", credits: 1000, usd: 15 },
];
export const creditPack = (id: string) => CREDIT_PACKS.find((p) => p.id === id) ?? null;

/** Builds an hour from one IP, before and after a paid plan: a brake on scripts, separate from credits. */
export const BUILDS_PER_HOUR = { free: 12, paid: 60 };
/** How many builds run on our models at once; past it, free builds queue behind paid ones. */
export const BUILD_SLOTS = 3;
/** Credits a request needs left to start (it's then charged what it really cost). */
export const START_CREDITS = { build: 4, edit: 0.5 };

/** Rows of the comparison table: a label and each plan's value (true = included, false = not, text = the detail). */
export const COMPARE: Array<{ label: string; values: Record<PlanId, string | boolean> }> = [
  { label: "AI credits", values: { free: "15 a day", pro: "800 a month", team: "2,000 a month, shared" } },
  { label: "Site builds", values: { free: "About 3 a day", pro: "100+ a month", team: "250+ a month" } },
  { label: "Edits and comments", values: { free: "Use credits", pro: "Use credits", team: "Use credits" } },
  { label: "On your own model key", values: { free: "Unlimited", pro: "Unlimited", team: "Unlimited" } },
  { label: "Credit packs", values: { free: true, pro: true, team: true } },
  { label: "Hosting", values: { free: "devit.lol subdomain", pro: "Custom domain", team: "Custom domain" } },
  { label: "“Built with sitesmith” footer", values: { free: "Shown", pro: false, team: false } },
  { label: "Private projects", values: { free: false, pro: true, team: true } },
  { label: "Priority models and queue", values: { free: false, pro: true, team: true } },
  { label: "Seats", values: { free: "1", pro: "1", team: "5" } },
  { label: "Shared projects and roles", values: { free: false, pro: false, team: true } },
];

export const FAQ: Array<{ q: string; a: string }> = [
  { q: "What's an AI credit?", a: "One credit is one cent of what the AI models cost us, counted from each reply. Writing a whole site takes about 3 to 8 credits, depending on the model; a chat edit or a comment usually takes well under one. Publishing, domains, restyles from the menu, undo and the live data on your site never use credits." },
  { q: "Why credits and not unlimited?", a: "So the price stays honest. Unlimited plans either cap you quietly or charge everyone for the few who script them. With credits you see exactly what's left, the bigger models simply use a little more, and nothing gets throttled behind your back." },
  { q: "What if I run out?", a: "Free credits come back every day (UTC). Pro and Team credits come back every 30 days of your plan. In between, a credit pack tops you up, or add your own model key in Settings and keep going for free." },
  { q: "How do I pay?", a: "With any token on any chain through NEAR Intents. You get a one-time deposit address; send the amount shown and the plan turns on once it lands. No card, no subscription to cancel." },
  { q: "What are credit packs?", a: "Extra credits you pay for once, on any plan. They're used only after your plan's own credits for the day or month are gone, and they never expire." },
  { q: "Can I use my own model keys?", a: "Yes, on every plan. Add a NEAR AI Cloud, Anthropic, OpenAI or OpenRouter key in Settings and your builds and edits run on it, without spending credits. If your key fails we fall back to ours, and that part uses credits." },
  { q: "What happens when a plan runs out?", a: "Your sites stay up. You go back to Free credits and the footer comes back until you renew. Pack credits stay yours." },
];

/** Credits for display: whole numbers from 100 up, one decimal below. */
export const fmtCredits = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n * 10) / 10));
