import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { askRichJson } from "../llm";
import { contrast, type Palette } from "../palette";
import { CHAINS, type BriefSection, type Chain, type DesignBrief, type Dossier, type Research, type Theme, type TokenInfo } from "../spec";
import { ARCHETYPES, analystSystem, directorSystem, WIDGET_DOC } from "./principles";
import { INSPIRATION_RULES, inspirationShots, inspirationText, pickInspiration } from "./inspiration";
import { BANNED_DISPLAY, fontMenu, fontPair, fontStacks, FONT_PAIRS, pairForMoods } from "./fonts";

// Two thinking passes before any code: the analyst reads everything research found (and looks at the pictures) and
// writes a dossier of facts with sources, story, voice and what content really exists; the art director turns that
// into a concept, palette, type and a section plan built from that content. The code writer only works from these.

const str = (d = "") => z.string().catch(d);
const strs = () => z.array(z.string()).catch([]);

const DossierSchema = z.object({
  oneLiner: str(),
  whatItIs: str(),
  story: str(),
  subject: z.object({ kind: str("concept"), description: str() }).catch({ kind: "concept", description: "" }),
  imagery: z.object({ logo: str(), banner: str(), artStyle: str(), motifs: strs() }).catch({ logo: "", banner: "", artStyle: "", motifs: [] }),
  audience: str(),
  tone: z.object({ adjectives: strs(), phrases: strs(), avoid: strs() }).catch({ adjectives: [], phrases: [], avoid: [] }),
  facts: z.array(z.object({ claim: z.string(), source: str("research") })).catch([]),
  utility: strs(),
  community: strs(),
  inventory: z.object({ roadmap: strs(), tokenomics: strs(), team: strs(), partners: strs(), milestones: strs() }).catch({ roadmap: [], tokenomics: [], team: [], partners: [], milestones: [] }),
  gaps: strs(),
  sectionIdeas: z.array(z.object({ id: str("section"), title: str(), why: str(), content: str() })).catch([]),
});

const HEX = /^#[0-9a-fA-F]{6}$/;
const SectionSchema = z.object({
  id: z.string(),
  label: str("Section"),
  purpose: str(),
  content: str(),
  composition: str(),
  widgets: strs(),
});
const BriefSchema = z.object({
  concept: z.string().min(10),
  archetype: str("editorial-magazine"),
  fontPair: str(),
  light: z.boolean().catch(false),
  mood: strs(),
  motifs: strs(),
  palette: z.record(z.string(), z.string()).catch({}),
  radius: z.number().catch(12),
  heroIdea: str(),
  signature: str(),
  motion: str(),
  texture: str(),
  layoutRules: strs(),
  avoid: strs(),
  inspiration: z.array(z.object({ ref: z.string(), borrow: z.string() })).catch([]),
  sections: z.array(SectionSchema).min(3),
});

export interface DesignInput {
  prompt: string;
  token: TokenInfo | null;
  chain: Chain;
  research: Research | null;
  palette: Palette | null;
  /** A style the person picked on the landing page (old style id), as a hint. */
  style?: string | null;
  /** Fallback name/ticker/tagline from the copywriter. */
  name: string;
  ticker: string;
  tagline: string;
}

/** Pictures worth showing the models (and allowing on the site): logo, banner, X banner, site image, post pictures. */
export function imagesOf(i: Pick<DesignInput, "token" | "research">, extra: Array<string | null | undefined> = []): string[] {
  const r = i.research;
  const all = [i.token?.logo, i.token?.header, r?.x?.profile.banner, r?.x?.profile.avatar, r?.website?.image, ...(r?.x?.posts ?? []).map((p) => p.image), ...extra];
  return [...new Set(all.filter((u): u is string => !!u && /^https:\/\//.test(u)))].slice(0, 10);
}

function compactMoney(n: number | null | undefined): string | null {
  if (n == null || !isFinite(n)) return null;
  return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(n < 1 ? 6 : 2)}`;
}

/** Everything research found, as plain labelled text for the analyst. */
function researchText(i: DesignInput): string {
  const t = i.token;
  const r = i.research;
  const lines: string[] = [];
  lines.push(`USER REQUEST: ${i.prompt}`);
  if (t) {
    lines.push(`TOKEN (chain data): ${t.name} ($${t.symbol}) on ${CHAINS[t.chain].name}, contract ${t.address}`);
    const nums = [["price", compactMoney(t.priceUsd)], ["market cap", compactMoney(t.marketCap)], ["liquidity", compactMoney(t.liquidityUsd)], ["24h volume", compactMoney(t.volume24h)], ["holders", t.holders?.toLocaleString("en-US")], ["24h change", t.change24h != null ? `${t.change24h.toFixed(1)}%` : null], ["supply", t.supply?.toLocaleString("en-US")]].filter(([, v]) => v);
    if (nums.length) lines.push(`LIVE NUMBERS (change constantly; on the site use widgets/binds, never hard-code): ${nums.map(([k, v]) => `${k} ${v}`).join(", ")}`);
    if (t.venue) lines.push(`VENUE: ${JSON.stringify(t.venue)}`);
    if (t.description) lines.push(`TOKEN DESCRIPTION: ${t.description}`);
  } else lines.push(`NO TOKEN YET. Name: ${i.name}, ticker ${i.ticker}.`);
  for (const d of r?.descriptions ?? []) lines.push(`DESCRIPTION (${d.source}): ${d.text}`);
  if (r?.website) lines.push(`WEBSITE ${r.website.url}: title "${r.website.title ?? ""}", description "${r.website.description ?? ""}"\nWEBSITE TEXT: ${(r.website.excerpt ?? "").slice(0, 2500)}`);
  if (r?.lore) lines.push(`STORY FOUND: ${r.lore}`);
  if (r?.utility.length) lines.push(`UTILITY FOUND: ${r.utility.join("; ")}`);
  if (r?.x) {
    const p = r.x.profile;
    lines.push(`X @${p.handle} (${p.name}), ${p.followers ?? "?"} followers. Bio: ${p.bio}`);
    lines.push(`VOICE MEASURED: ${r.x.voice.notes.join(", ")}; emojis ${r.x.voice.emojis.join(" ")}; frequent words ${r.x.voice.words.slice(0, 12).join(", ")}; tags ${r.x.voice.tags.join(" ")}`);
    for (const post of r.x.posts.slice(0, 12)) lines.push(`X POST ${new Date(post.at).toISOString().slice(0, 10)} (${post.likes} likes): ${post.text.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  if (r?.links.length) lines.push(`LINKS: ${r.links.map((l) => `${l.label} ${l.url}`).join(" | ")}`);
  if (i.palette) lines.push(`ARTWORK COLOURS (from ${i.palette.from.join(" + ")}, biggest first): ${i.palette.swatches.map((s) => `${s.hex} ${(s.share * 100).toFixed(0)}%`).join(", ")}; vivid ${i.palette.vivid ?? "none"}; artwork reads ${i.palette.lean}`);
  return lines.join("\n");
}

/** Pass 1: read and understand. Null when no model answered. */
export async function understand(i: DesignInput): Promise<Dossier | null> {
  const images = imagesOf(i);
  const user = `${researchText(i)}\n\nPICTURES ATTACHED (in order): ${images.join(", ") || "none"}\n\nWrite the dossier as JSON with keys: oneLiner, whatItIs, story, subject{kind,description}, imagery{logo,banner,artStyle,motifs[]}, audience, tone{adjectives[],phrases[],avoid[]}, facts[{claim,source}], utility[], community[], inventory{roadmap[],tokenomics[],team[],partners[],milestones[]}, gaps[], sectionIdeas[{id,title,why,content}].`;
  const res = await askRichJson({ system: analystSystem(), user, images, maxOut: 16000, timeoutMs: 180_000, temperature: 0.3, think: "medium" }, (v) => {
    const p = DossierSchema.safeParse(v);
    return p.success && (p.data.whatItIs || p.data.oneLiner) ? (p.data as Dossier) : null;
  });
  return res ? { ...res.value, via: res.via } : null;
}

// ---------- variety: what recent sites looked like ----------

const HISTORY = path.join(process.cwd(), "data", "briefs.json");
interface Past { archetype: string; fontPair: string; light: boolean; accent: string; refs?: string[]; at: number }

async function recent(): Promise<Past[]> {
  try {
    const j = JSON.parse(await fs.readFile(HISTORY, "utf8")) as Past[];
    return Array.isArray(j) ? j.slice(-12) : [];
  } catch {
    return [];
  }
}

export async function remember(b: DesignBrief): Promise<void> {
  try {
    const list = [...(await recent()), { archetype: b.archetype, fontPair: b.fontPair, light: b.light, accent: b.palette.accent ?? "", refs: (b.inspiration ?? []).map((x) => x.ref), at: Date.now() }].slice(-12);
    await fs.mkdir(path.dirname(HISTORY), { recursive: true });
    await fs.writeFile(HISTORY, JSON.stringify(list));
  } catch { /* variety is best-effort */ }
}

/** A seed archetype not used recently; random so the same token rebuilt gets a fresh take. */
function seedArchetype(past: Past[]): (typeof ARCHETYPES)[number] {
  const used = new Set(past.map((p) => p.archetype));
  const fresh = ARCHETYPES.filter((a) => !used.has(a.id));
  const pool = fresh.length ? fresh : [...ARCHETYPES];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- palette repair ----------

const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
};

/** Moves fg toward black or white (whichever is further from bg) until it reaches the ratio. */
export function contrastFix(fg: string, bg: string, min: number): string {
  if (!HEX.test(fg) || !HEX.test(bg)) return fg;
  if (contrast(fg, bg) >= min) return fg;
  const target = contrast("#000000", bg) > contrast("#FFFFFF", bg) ? "#000000" : "#FFFFFF";
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const c = mixHex(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

function fixPalette(raw: Record<string, string>, light: boolean, sw: Palette | null): Record<string, string> {
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (HEX.test(v)) p[k] = v.toUpperCase();
  const vivid = sw?.vivid ?? "#F2C94C";
  p.bg ??= light ? "#F6F2EA" : "#0E0D0C";
  p.surface ??= mixHex(p.bg, light ? "#000000" : "#FFFFFF", 0.05);
  p.text ??= light ? "#151413" : "#F4F1EA";
  p.text = contrastFix(p.text, p.bg, 7);
  p.muted = contrastFix(p.muted ?? mixHex(p.text, p.bg, 0.4), p.bg, 4.5);
  p.border ??= mixHex(p.text, p.bg, 0.82);
  p.accent ??= vivid;
  p.accentText = contrastFix(p.accentText ?? (contrast("#000000", p.accent) > contrast("#FFFFFF", p.accent) ? "#000000" : "#FFFFFF"), p.accent, 4.5);
  return p;
}

/** The widget-facing theme for a brief: base style for anything the code doesn't set, brief colours and type on top. */
export function themeOfBrief(base: Theme, b: DesignBrief): Theme {
  const fp = fontPair(b.fontPair) ?? FONT_PAIRS[0];
  const st = fontStacks(fp);
  const c = b.palette;
  return {
    ...base,
    dark: !b.light,
    bg: c.bg, surface: c.surface, text: c.text, muted: c.muted, border: c.border, accent: c.accent, accentText: c.accentText,
    radius: Math.max(0, Math.min(32, Math.round(b.radius))),
    fontDisplay: st.display, fontBody: st.body, fontMono: st.mono,
    fontsHref: `https://fonts.googleapis.com/css2?${fp.params.join("&")}&display=swap`,
    uppercase: false,
  };
}

/** Pass 2: art direction and the section plan. Null when no model answered. */
export async function direct(i: DesignInput, d: Dossier): Promise<DesignBrief | null> {
  const past = await recent();
  const seed = seedArchetype(past);
  const avoidFonts = past.slice(-6).map((p) => p.fontPair);
  const lights = past.slice(-4).map((p) => (p.light ? "light" : "dark"));
  const images = imagesOf(i).slice(0, 3);
  // A few references from the team's library that suit this project, shown with their screenshots.
  const refs = pickInspiration(d, seed.id, i.palette ? i.palette.lean === "light" : null, past.flatMap((p) => p.refs ?? []).slice(-9));
  const shots = await inspirationShots(refs);
  const user = `DOSSIER:\n${JSON.stringify(d)}\n
ARTWORK COLOURS: ${i.palette ? i.palette.swatches.map((s) => `${s.hex} (${(s.share * 100).toFixed(0)}%, sat ${s.s.toFixed(2)})`).join(", ") + `; vivid ${i.palette.vivid ?? "none"}; artwork reads ${i.palette.lean}` : "not readable; derive from the imagery description"}
SEED ARCHETYPE: ${seed.id}: ${seed.hint}
OTHER ARCHETYPES: ${ARCHETYPES.filter((a) => a.id !== seed.id).map((a) => a.id).join(", ")}
RECENT SITES (avoid repeating): ${past.length ? past.slice(-6).map((p) => `${p.archetype}/${p.fontPair}/${p.light ? "light" : "dark"}`).join("; ") : "none yet"}${lights.length >= 3 && lights.every((x) => x === lights[0]) ? `. The last ${lights.length} were all ${lights[0]}: prefer ${lights[0] === "dark" ? "light" : "dark"} unless the artwork clearly demands otherwise.` : ""}
FONT PAIRS (pick one id; do not use: ${avoidFonts.join(", ") || "-"}):\n${fontMenu()}
${i.style ? `THE PERSON PICKED THE STYLE "${i.style}" ON THE LANDING PAGE: honour its spirit in the archetype.\n` : ""}USER REQUEST: ${i.prompt}
HAS TOKEN: ${i.token ? `yes, trades ${i.token.pairAddress || i.token.marketCap ? "live (use chart + stats)" : "not yet / on curve"}` : "no (no buy/ca widgets; use signup)"}
${WIDGET_DOC}

REFERENCE SITES FROM THE TEAM'S LIBRARY (screenshots attached after the project's own pictures):
${inspirationText(refs)}
${INSPIRATION_RULES}
In "inspiration", name each reference you draw on (its id) and exactly which principle you borrow and how it becomes this project's own (e.g. "mascot bleeding off the frame edge, here the cowl silhouette cut by the right edge"). One to three entries.

Return JSON: {concept, archetype, fontPair, light, mood[], motifs[], palette{bg,surface,text,muted,border,accent,accentText,...extras}, radius (px number), heroIdea, signature, motion, texture, layoutRules[], avoid[], inspiration[{ref,borrow}], sections[{id,label,purpose,content,composition,widgets[]}]}.`;
  const res = await askRichJson({ system: directorSystem(), user, images, files: shots, maxOut: 16000, timeoutMs: 180_000, temperature: 0.9, think: "medium" }, (v) => {
    const p = BriefSchema.safeParse(v);
    return p.success ? p.data : null;
  });
  if (!res) return null;
  const b = res.value;
  // Keep only ids from the curated list; a missing or banned one falls back to the mood's best fit.
  let fp = fontPair(b.fontPair);
  if (!fp || BANNED_DISPLAY.includes(fp.display)) fp = pairForMoods([...b.mood, b.archetype], avoidFonts);
  const sections = uniqueSections(b.sections, !!i.token);
  return {
    ...b,
    fontPair: fp.id,
    palette: fixPalette(b.palette, b.light, i.palette),
    inspiration: b.inspiration.map((x) => ({ ref: x.ref.trim(), borrow: x.borrow })).filter((x) => refs.some((r) => r.id === x.ref)).slice(0, 3),
    sections,
    via: res.via,
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "section";

/** Unique kebab ids, known widgets only, and a buy area guaranteed when there is a token. */
function uniqueSections(list: BriefSection[], hasToken: boolean): BriefSection[] {
  const known = new Set(["buy", "chart", "trades", "stats", "ca", "wallet", "signup", "whatif", "leaderboard", "milestones", "toasts"]);
  const seen = new Set<string>();
  const out = list.slice(0, 10).map((s) => {
    let id = slug(s.id || s.label);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    return { ...s, id, widgets: s.widgets.map((w) => w.toLowerCase().trim()).filter((w) => known.has(w)) };
  });
  if (hasToken && !out.some((s) => s.widgets.includes("buy"))) {
    const at = Math.max(1, out.length - 1);
    out.splice(at, 0, { id: seen.has("buy") ? "buy-now" : "buy", label: "Buy", purpose: "Let visitors buy right here", content: "The swap box and the contract address", composition: "A framed panel in the archetype's language with the buy widget and the CA", widgets: ["buy", "ca"] });
  }
  if (hasToken && !out.some((s) => s.widgets.includes("ca"))) out.find((s) => s.widgets.includes("buy"))?.widgets.push("ca");
  return out;
}
