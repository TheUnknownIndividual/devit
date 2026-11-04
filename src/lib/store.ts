import { mkdir, readFile, rename, rm, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Project } from "./spec";

// Projects live as JSON files for the prototype. One writer per project id at a time.
const DIR = path.join(process.cwd(), "data", "projects");
const locks = new Map<string, Promise<unknown>>();

function file(id: string): string {
  if (!/^[a-z0-9]{6,24}$/.test(id)) throw new Error("bad project id");
  return path.join(DIR, `${id}.json`);
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    return JSON.parse(await readFile(file(id), "utf8")) as Project;
  } catch {
    return null;
  }
}

export async function saveProject(p: Project): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const f = file(p.id);
  const tmp = `${f}.${process.pid}.tmp`;
  p.updatedAt = Date.now();
  await writeFile(tmp, JSON.stringify(p));
  await rename(tmp, f);
}

/** Read-modify-write under a per-project lock so the build loop and edits never clobber each other. */
export async function updateProject(id: string, fn: (p: Project) => void | Promise<void>): Promise<Project | null> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const p = await getProject(id);
    if (!p) return null;
    await fn(p);
    await saveProject(p);
    return p;
  });
  locks.set(id, next.catch(() => undefined));
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  const prev = locks.get(id) ?? Promise.resolve();
  await prev;
  await rm(file(id), { force: true });
  locks.delete(id);
}

export async function findBySlug(slug: string): Promise<Project | null> {
  try {
    const names = await readdir(DIR);
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      const p = await getProject(n.slice(0, -5));
      if (p?.published?.slug === slug) return p;
    }
  } catch {
    /* no projects yet */
  }
  return null;
}

export async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const p = await findBySlug(slug);
  return !!p && p.id !== exceptId;
}

/** Newest first. Fine for a prototype's handful of files. */
export async function listProjects(limit = 50): Promise<Project[]> {
  try {
    const names = (await readdir(DIR)).filter((n) => n.endsWith(".json"));
    const all = await Promise.all(names.map((n) => getProject(n.slice(0, -5))));
    return all.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  } catch {
    return [];
  }
}
