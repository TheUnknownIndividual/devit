// What a plan unlocks, in one place. Every Pro/Team check goes through here so the pricing page and the code agree.
import { activePlan, getUser, type User } from "./accounts";
import type { PlanId } from "./plans";
import type { Project } from "./spec";

export type Feature = "unlimitedBuilds" | "customDomain" | "noFooter" | "privateSites" | "priorityModels" | "teams";

const FEATURES: Record<PlanId, Feature[]> = {
  free: [],
  pro: ["unlimitedBuilds", "customDomain", "noFooter", "privateSites", "priorityModels"],
  team: ["unlimitedBuilds", "customDomain", "noFooter", "privateSites", "priorityModels", "teams"],
};

/** The plan a user works under: their own, or the best plan of a team they belong to (teams hook in here). */
export async function planOf(u: User | null): Promise<PlanId> {
  return activePlan(u);
}

export async function entitled(u: User | null, f: Feature): Promise<boolean> {
  return FEATURES[await planOf(u)].includes(f);
}

/** A project's features come from its owner's plan, whoever is looking at it. */
export async function projectEntitled(p: Pick<Project, "ownerId">, f: Feature): Promise<boolean> {
  return entitled(p.ownerId ? await getUser(p.ownerId) : null, f);
}

/** For a refused request: which plan unlocks the feature, in words. */
export const upgradeFor = (f: Feature) => (f === "teams" ? "Team" : "Pro");
export const needsPlan = (f: Feature) => Response.json({ error: `That's on the ${upgradeFor(f)} plan.`, upgrade: upgradeFor(f).toLowerCase(), feature: f }, { status: 402 });
