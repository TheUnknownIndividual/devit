import { displayName, type Project } from "./spec";
import { sitesDomain, siteUrl } from "./sites";

/** What the builder sees: never echo a saved paid RPC URL back, only whether one is set. */
export function publicProject(p: Project) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { network, publishedSpec, anon, ...rest } = p;
  return { ...rest, title: displayName(p), network: { chain: network.chain, rpcUrlSet: !!network.rpcUrl }, integrations: { ...p.integrations, rpcUrl: undefined }, liveUrl: p.published ? siteUrl(p.published.slug) : null, sitesDomain: sitesDomain(), publishedIsCurrent: publishedSpec ? JSON.stringify(publishedSpec) === JSON.stringify(p.spec) : null };
}

export type PublicProject = ReturnType<typeof publicProject>;
