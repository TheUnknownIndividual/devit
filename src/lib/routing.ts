import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Project } from "./spec";

// What the proxy needs per request, without opening project files: verified custom hosts → their site, and which
// published slugs are private. data/routing.json is rewritten whenever a project's publish, domain or access changes;
// the proxy re-reads it when its mtime moves (checked at most once a second).

export interface Routing {
  hosts: Record<string, { id: string; slug: string | null; status: "verified" | "live" }>;
  private: Record<string, { id: string; mode: "link" | "password" }>;
}

const FILE = path.join(process.cwd(), "data", "routing.json");
const empty = (): Routing => ({ hosts: {}, private: {} });

async function load(): Promise<Routing> {
  try {
    const r = JSON.parse(await readFile(FILE, "utf8")) as Partial<Routing>;
    return { hosts: r.hosts ?? {}, private: r.private ?? {} };
  } catch {
    return empty();
  }
}

let cache: { r: Routing; mtime: number; checked: number } | null = null;

export async function routing(): Promise<Routing> {
  const now = Date.now();
  if (cache && now - cache.checked < 1000) return cache.r;
  const mtime = await stat(FILE).then((s) => s.mtimeMs).catch(() => 0);
  if (!cache || cache.mtime !== mtime) cache = { r: mtime ? await load() : empty(), mtime, checked: now };
  else cache.checked = now;
  return cache.r;
}

let lock: Promise<unknown> = Promise.resolve();

async function edit(fn: (r: Routing) => void): Promise<void> {
  const next = lock.then(async () => {
    const r = await load();
    fn(r);
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(r));
    await rename(tmp, FILE);
    cache = null;
  });
  lock = next.catch(() => undefined);
  return next;
}

const without = (r: Routing, id: string) => {
  for (const [h, v] of Object.entries(r.hosts)) if (v.id === id) delete r.hosts[h];
  for (const [s, v] of Object.entries(r.private)) if (v.id === id) delete r.private[s];
};

/** Brings the table in line with one project. Call after anything that changes its publish, domain or access. */
export function syncRouting(p: Project): Promise<void> {
  return edit((r) => {
    without(r, p.id);
    const slug = p.published?.slug ?? null;
    if (p.domain && p.domain.status !== "pending") r.hosts[p.domain.host] = { id: p.id, slug, status: p.domain.status };
    if (slug && p.access && p.access.mode !== "public") r.private[slug] = { id: p.id, mode: p.access.mode };
  });
}

export const dropRouting = (id: string) => edit((r) => without(r, id));
