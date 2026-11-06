// Plans and prices in one place. Placeholder numbers until the owner confirms them; the pricing page, the pay
// button and the build limit all read from here.

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
  /** Builds a day; null = unlimited within fair use. */
  buildsPerDay: number | null;
  seats: number;
  perks: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free", name: "Free", blurb: "Launch a site and see it live.", monthly: 0, yearly: 0, buildsPerDay: 5, seats: 1,
    perks: ["5 builds a day", "Unlimited edits", "Hosting on a sitesmith subdomain", "“Built with sitesmith” footer", "Use your own API keys"],
  },
  {
    id: "pro", name: "Pro", blurb: "For teams shipping a token for real.", monthly: 20, yearly: 16, buildsPerDay: null, seats: 1,
    perks: ["Unlimited builds within fair use", "Custom domain, or buy one in the builder", "No sitesmith footer", "Private projects", "Priority models"],
  },
  {
    id: "team", name: "Team", blurb: "One workspace for the whole crew.", monthly: 49, yearly: 39, buildsPerDay: null, seats: 5,
    perks: ["Everything in Pro", "5 seats", "Shared projects", "Roles: owner, editor, viewer"],
  },
];

export const plan = (id: PlanId | undefined): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** What one payment covers, in USD. */
export const priceUsd = (p: Plan, cycle: Cycle) => (cycle === "yearly" ? p.yearly * 12 : p.monthly);

/** Days one payment adds to a plan. */
export const cycleDays = (cycle: Cycle) => (cycle === "yearly" ? 365 : 30);

/** "Unlimited" builds still stop here in a day; past it is scripted or resold use. */
export const FAIR_USE_BUILDS_PER_DAY = 100;
/** Builds an hour from one IP, before and after a paid plan. */
export const BUILDS_PER_HOUR = { free: 12, paid: 60 };
/** How many builds run on our models at once; past it, free builds queue behind paid ones. */
export const BUILD_SLOTS = 3;

/** Rows of the comparison table: a label and each plan's value (true = included, false = not, text = the detail). */
export const COMPARE: Array<{ label: string; values: Record<PlanId, string | boolean> }> = [
  { label: "Builds", values: { free: "5 a day", pro: "Unlimited*", team: "Unlimited*" } },
  { label: "Edits and comments", values: { free: "Unlimited", pro: "Unlimited", team: "Unlimited" } },
  { label: "Hosting", values: { free: "sitesmith subdomain", pro: "Custom domain", team: "Custom domain" } },
  { label: "“Built with sitesmith” footer", values: { free: "Shown", pro: false, team: false } },
  { label: "Private projects", values: { free: false, pro: true, team: true } },
  { label: "Priority models", values: { free: false, pro: true, team: true } },
  { label: "Bring your own API keys", values: { free: true, pro: true, team: true } },
  { label: "Seats", values: { free: "1", pro: "1", team: "5" } },
  { label: "Shared projects and roles", values: { free: false, pro: false, team: true } },
];

export const FAQ: Array<{ q: string; a: string }> = [
  { q: "What counts as a build?", a: "Writing a new site from a sentence. Edits, comments, restyles and publishing never count. Builds that run on your own API key don't count either." },
  { q: "How do I pay?", a: "With any token on any chain through NEAR Intents. You get a one-time deposit address; send the amount shown and the plan turns on once it lands. No card, no subscription to cancel." },
  { q: "What does “fair use” mean?", a: "Unlimited builds for people building their own sites. Scripted or resold builds get a friendly email first." },
  { q: "Can I use my own model keys?", a: "Yes, on every plan. Add a NEAR AI Cloud, Anthropic, OpenAI or OpenRouter key in Settings and your builds run on it first, then on ours if it fails." },
  { q: "What happens when a plan runs out?", a: "Your sites stay up. You go back to Free limits and the footer comes back until you renew." },
];
