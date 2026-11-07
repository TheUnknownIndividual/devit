import { ownerKeysFor } from "./accounts";
import { twitterApi } from "./research";
import type { Project, SiteSpec, XPost } from "./spec";

// Live "From X" posts on a published site, paid by the owner's own twitterapi.io key (Keys). At most one read per
// site an hour, whatever the traffic: visitors get the last copy at once and a stale copy is refreshed in the
// background, so a page never waits on X. Without the owner's key the posts stay as they were at build time.

const HOUR = 3600_000;
const cache = new Map<string, { posts: XPost[]; at: number }>();
const inFlight = new Set<string>();

async function refresh(id: string, handle: string, key: string) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const r = await twitterApi(handle, key).catch(() => null);
    // A failed read keeps the old copy and waits the full hour before trying again.
    cache.set(id, { posts: r?.posts.length ? r.posts : cache.get(id)?.posts ?? [], at: Date.now() });
  } finally {
    inFlight.delete(id);
  }
}

/** The spec with fresher X posts when there are some; otherwise the spec as it is. */
export async function withLivePosts(p: Project, spec: SiteSpec): Promise<SiteSpec> {
  const handle = spec.x?.profile.handle;
  if (!handle || !spec.blocks.some((b) => b.type === "posts")) return spec;
  const key = (await ownerKeysFor(p.ownerId).catch(() => null))?.twitterapi;
  if (!key) return spec;
  const c = cache.get(p.id);
  if (!c || Date.now() - c.at > HOUR) void refresh(p.id, handle, key);
  return c?.posts.length ? { ...spec, x: { ...spec.x!, posts: c.posts } } : spec;
}
