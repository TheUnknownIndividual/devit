import { projectEntitled } from "./entitlements";
import { sitesDomain } from "./sites";
import type { Project } from "./spec";

/**
 * The "Built with sitesmith" line in a site's footer: on free sites, off for Pro/Team owners. Decided when the page
 * renders, so it comes back by itself when a plan lapses. Links to APP_URL, else the sites domain, else this origin.
 */
export async function siteCredit(p: Pick<Project, "ownerId">): Promise<string | null> {
  if (await projectEntitled(p, "noFooter")) return null;
  const d = sitesDomain();
  return process.env.APP_URL?.trim() || (d ? `https://${d}` : "/");
}
