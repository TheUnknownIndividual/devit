// What a plan unlocks, in one place. Every Pro/Team check goes through here so the pricing page and the code agree.
import { activePlan, getUser, type User } from "./accounts";
import { plan, type PlanId } from "./plans";
import type { Project } from "./spec";
import { teamsOf, type Team } from "./teams";

export type Feature = "customDomain" | "noFooter" | "privateSites" | "priorityModels" | "teams";

const FEATURES: Record<PlanId, Feature[]> = {
  free: [],
  pro: ["customDomain", "noFooter", "privateSites", "priorityModels"],
  team: ["customDomain", "noFooter", "privateSites", "priorityModels", "teams"],
};
const RANK: Record<PlanId, number> = { free: 0, pro: 1, team: 2 };

/** A team works while its owner's own plan runs teams; after that members can only look. */
export async function teamActive(t: Team): Promise<boolean> {
  return FEATURES[activePlan(await getUser(t.ownerId))].includes("teams");
}

/** Seats come from the owner's plan; the owner holds one. */
export async function teamSeats(t: Team): Promise<number> {
  return plan(activePlan(await getUser(t.ownerId))).seats;
}

/** The plan a user works under: their own, or the best plan of a team they belong to (teams hook in here). */
export async function planOf(u: User | null): Promise<PlanId> {
  let best = activePlan(u);
  if (!u || best === "team") return best;
  for (const t of await teamsOf(u.id)) {
    if (t.ownerId === u.id) continue;
    const p = activePlan(await getUser(t.ownerId));
    if (FEATURES[p].includes("teams") && RANK[p] > RANK[best]) best = p;
  }
  return best;
}

export async function entitled(u: User | null, f: Feature): Promise<boolean> {
  // Running a team is the payer's own; members borrow everything else.
  return FEATURES[f === "teams" ? activePlan(u) : await planOf(u)].includes(f);
}

/** A project's features come from its owner's plan, whoever is looking at it. */
export async function projectEntitled(p: Pick<Project, "ownerId">, f: Feature): Promise<boolean> {
  return entitled(p.ownerId ? await getUser(p.ownerId) : null, f);
}

/** For a refused request: which plan unlocks the feature, in words. */
export const upgradeFor = (f: Feature) => (f === "teams" ? "Team" : "Pro");
export const needsPlan = (f: Feature) => Response.json({ error: `That's on the ${upgradeFor(f)} plan.`, upgrade: upgradeFor(f).toLowerCase(), feature: f }, { status: 402 });
