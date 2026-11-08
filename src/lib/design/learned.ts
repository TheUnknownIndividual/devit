import { promises as fs } from "node:fs";
import path from "node:path";
import type { Project } from "../spec";
import { isPrivateSite } from "../site-access";
import type { Inspiration } from "./inspiration";
import { inspect, staticPage } from "./review";

// The library grows from devit's own best work. When a public site is published and its design measures clean in
// the browser (at most one layout fault at desktop and phone width), its first screen and what the art director
// planned for it join the references future builds can draw on, alongside the hand-picked ones in design-refs/.
// Kept to the newest MAX sites; a republish replaces the site's entry. Private sites and demo tokens never join.

export interface LearnedRef extends Inspiration {
  projectId: string;
  /** The token's address, so a rebuild of the same token never draws on its own earlier site. */
  address: string | null;
  slug: string;
  at: number;
}

const DIR = path.join(process.cwd(), "data", "learned-refs");
const INDEX = path.join(DIR, "index.json");
const MAX = 60;
/** At most this many measured faults for a site to count as an example of good work. */
const CLEAN = 1;

let cache: { at: number; list: LearnedRef[] } | null = null;

export async function learnedRefs(): Promise<LearnedRef[]> {
  try {
    const st = await fs.stat(INDEX);
    if (cache && cache.at === st.mtimeMs) return cache.list;
    const list = JSON.parse(await fs.readFile(INDEX, "utf8")) as LearnedRef[];
    cache = { at: st.mtimeMs, list: Array.isArray(list) ? list : [] };
    return cache.list;
  } catch {
    return [];
  }
}

export const learnedShot = (id: string) => path.join(DIR, `${id.replace(/[^a-z0-9-]/gi, "")}.jpg`);

const words = (xs: Array<string | undefined | null>) => [...new Set(xs.join(" ").toLowerCase().match(/[a-z]{3,}/g) ?? [])].slice(0, 24);

/**
 * Looks at a just-published site and, when it measures clean, adds it to the library. Returns why it was or wasn't
 * added (for logs). Never throws.
 */
export async function learnFrom(p: Project): Promise<string> {
  try {
    const spec = p.publishedSpec ?? p.spec;
    const code = spec?.code;
    const b = code?.brief;
    if (!spec || !code || !b || !p.published) return "not a generated-code site";
    if (isPrivateSite(p) || spec.token?.demo) return "private or demo";
    const seen = await inspect(staticPage(code, spec.blocks), { full: false });
    if (!seen) return "no browser";
    if (seen.issues.length > CLEAN) return `${seen.issues.length} layout faults, not added`;
    const first = seen.shots[0];
    if (!first) return "no screenshot";
    const id = `devit-${p.published.slug}`.slice(0, 48);
    const d = code.dossier;
    const ref: LearnedRef = {
      id,
      kind: "token",
      own: true,
      light: b.light,
      moods: words([...b.mood, ...b.motifs, ...(d?.tone?.adjectives ?? []), d?.imagery?.artStyle, b.texture]),
      archetypes: [b.archetype],
      hero: b.heroIdea,
      dna: [
        `Concept: ${b.concept}`,
        `Signature: ${b.signature}`,
        `Motion: ${b.motion}`,
        `Type: ${b.fontPair}. Texture: ${b.texture}`,
        ...(b.layoutRules ?? []).slice(0, 3),
      ].map((x) => { const t = x.trim().slice(0, 320); return /[.!?]$/.test(t) ? t : `${t}.`; }),
      projectId: p.id,
      address: spec.token?.address ?? null,
      slug: p.published.slug,
      at: Date.now(),
    };
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(learnedShot(id), Buffer.from(first.data, "base64"));
    const list = (await learnedRefs()).filter((r) => r.projectId !== p.id && r.id !== id);
    list.push(ref);
    const keep = list.sort((x, y) => x.at - y.at).slice(-MAX);
    for (const gone of list.filter((r) => !keep.includes(r))) await fs.rm(learnedShot(gone.id), { force: true });
    const tmp = `${INDEX}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(keep));
    await fs.rename(tmp, INDEX);
    return `added as ${id}`;
  } catch (e) {
    return `failed: ${e instanceof Error ? e.message : "error"}`;
  }
}
