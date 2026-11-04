import fs from "node:fs";
import path from "node:path";
import { fitAccent, fxOf, readableOn } from "./themes";
import { themeForRef } from "./ref-style";
import type { Chain, RefRead, Theme, ThemeId } from "./spec";

// A library of live token sites' styles (scripts/collect-style-refs.ts fills it from DexScreener): palette, type and
// layout traits plus tone tags and a small thumbnail, never their words, pictures or markup. A build with no
// reference site of its own borrows a few of these to nudge its look.

export const STYLE_DIR = path.join(process.cwd(), "data", "style-refs");
const INDEX = path.join(STYLE_DIR, "index.json");

export interface StyleRef {
  host: string;
  chain: string;
  at: number;
  palette: { bg: string | null; surface: string | null; text: string | null; accent: string | null; dark: boolean | null };
  fonts: { display: string | null; body: string | null };
  layout: { hero: "split" | "media" | "text"; sections: string[]; density: "compact" | "regular" | "airy"; card: "outline" | "soft" | "glass" | "offset" | null; motion: string[]; ticker: boolean; pill: boolean; reveal: string | null; hover: string | null; speed: string | null };
  /** Tone tags, strongest first (THEME_IDS). */
  tags: ThemeId[];
  shot: string | null;
}

/** The style record of one read: structure and tone only. */
export function styleRefOf(r: RefRead, chain: string, shot: string | null): StyleRef {
  const secs = r.pages[0]?.sections ?? [];
  const h = secs[0];
  const avg = secs.length ? secs.reduce((a, s) => a + s.heightPx, 0) / secs.length : 700;
  const display = `${r.fonts.display ?? ""} ${r.fonts.google.join(" ")}`.toLowerCase();
  const m = r.motion;
  const tags = new Set<ThemeId>();
  const main = themeForRef(r);
  if (main) tags.add(main);
  if (/mono|code|courier/.test(display) && r.palette.dark) tags.add("terminal");
  if (r.surface === "offset") tags.add("brutal");
  if (r.surface === "glass") tags.add("glass");
  if (/press start|vt323|pixel|silkscreen/.test(display)) tags.add("retro");
  if (/fredoka|nunito|baloo|quicksand|rounded/.test(display) || m.speed === "bouncy") tags.add("cozy");
  if (r.palette.dark && (m.marquee || r.uppercase)) tags.add("degen");
  if (r.palette.dark === false) tags.add((r.radius ?? 0) >= 16 ? "app" : "clean");
  const motion = [m.reveal && `reveal-${m.reveal}`, m.hover && `hover-${m.hover}`, m.parallax && "parallax", m.smoothScroll && "smooth-scroll", m.sticky && "sticky"].filter((x): x is string => !!x);
  return {
    host: r.host, chain, at: Date.now(),
    palette: { bg: r.palette.bg, surface: r.palette.surface, text: r.palette.text, accent: r.palette.accent, dark: r.palette.dark },
    fonts: { display: r.fonts.display, body: r.fonts.body },
    layout: {
      hero: h?.media ? (h.cols >= 2 ? "split" : "media") : "text", sections: secs.map((s) => s.kind).slice(0, 12),
      density: avg < 600 ? "compact" : avg > 900 ? "airy" : "regular", card: r.surface, motion, ticker: m.marquee, pill: (r.radius ?? 0) >= 20,
      reveal: m.reveal, hover: m.hover, speed: m.speed,
    },
    tags: [...tags], shot,
  };
}

let cache: { at: number; refs: StyleRef[] } | null = null;

/** The library, newest first; read once a minute at most. Empty when the collector hasn't run. */
export function loadStyleRefs(): StyleRef[] {
  if (cache && Date.now() - cache.at < 60_000) return cache.refs;
  let refs: StyleRef[] = [];
  try { refs = (JSON.parse(fs.readFileSync(INDEX, "utf8")) as StyleRef[]).sort((a, b) => b.at - a.at); } catch { /* no library yet */ }
  cache = { at: Date.now(), refs };
  return refs;
}

// Words in a sentence that point at a tone.
const VIBE: Array<[RegExp, ThemeId]> = [
  [/\b(loud|degen|meme|wild|chaos|ape|pump|moon|frog|pepe|shitcoin)\b/i, "degen"], [/\b(clean|minimal|simple|corporate|pro|serious)\b/i, "clean"],
  [/\b(retro|pixel|arcade|8.?bit|y2k)\b/i, "retro"], [/\b(cozy|cute|soft|friendly|warm|pastel)\b/i, "cozy"],
  [/\b(terminal|hacker|mono|cyber|trading|sniper|bot)\b/i, "terminal"], [/\b(app|wallet|fintech|mobile)\b/i, "app"],
  [/\b(brutal\w*|raw|bold|poster)\b/i, "brutal"], [/\b(glass|blur|defi|swap|protocol|futur\w*)\b/i, "glass"],
];

const vivid = (h: string) => { const n = parseInt(h.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255]; return (Math.max(...c) - Math.min(...c)) / Math.max(...c, 1) > 0.4; };

export interface StyleQuery { vibe?: string; theme?: ThemeId | null; chain?: Chain | null; kind?: "meme" | "utility" | null }

/** Two or three records that fit the vibe: tone-tag match first, then chain and recency, never two from one host. */
export function pickStyleRefs(q: StyleQuery, n = 3): StyleRef[] {
  const want = new Set<ThemeId>(VIBE.filter(([re]) => re.test(q.vibe ?? "")).map(([, t]) => t));
  const kindTags: ThemeId[] = q.kind === "meme" ? ["degen", "cozy", "brutal", "retro"] : q.kind === "utility" ? ["clean", "app", "glass", "terminal"] : [];
  const refs = loadStyleRefs();
  if (!refs.length) return [];
  const newest = refs[0].at, oldest = refs[refs.length - 1].at;
  const scored = refs.map((r) => {
    let s = 0;
    r.tags.forEach((t, i) => {
      const w = i === 0 ? 1 : 0.5;
      if (t === q.theme) s += 3 * w;
      if (want.has(t)) s += 1.5 * w;
      if (kindTags.includes(t)) s += 0.5 * w;
    });
    if (q.chain && r.chain === q.chain) s += 1;
    s += newest > oldest ? (r.at - oldest) / (newest - oldest) : 0.5;
    return { r, s: s + (r.shot ? 0.1 : 0) };
  }).sort((a, b) => b.s - a.s);
  const out: StyleRef[] = [];
  for (const { r } of scored) if (out.length < n && !out.some((o) => o.host === r.host)) out.push(r);
  return out;
}

/** The style the picks agree on, else `cur`. */
export function themeOfPicks(picks: StyleRef[], cur: ThemeId): ThemeId {
  const votes = new Map<ThemeId, number>();
  for (const p of picks) p.tags.forEach((t, i) => votes.set(t, (votes.get(t) ?? 0) + (i === 0 ? 2 : 1)));
  const [best] = [...votes].sort((a, b) => b[1] - a[1]);
  return best && best[1] >= 3 ? best[0] : cur;
}

/** Style only: motion, ticker, density and (when `accent` is free) the accent of the picks that share the theme's tone. */
export function nudgeTheme(theme: Theme, picks: StyleRef[], accent: boolean): Theme {
  const kin = picks.filter((p) => p.tags.includes(theme.id));
  const use = kin.length ? kin : picks;
  const mode = <T,>(xs: Array<T | null | undefined>): T | undefined => {
    const c = new Map<T, number>();
    for (const x of xs) if (x != null) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const fx = fxOf(theme);
  const hex = kin.map((p) => p.palette.accent).find((a): a is string => !!a && /^#[0-9a-f]{6}$/i.test(a) && vivid(a));
  const acc = accent && hex ? fitAccent(hex, theme.dark) : null;
  return {
    ...theme, ...(acc ? { accent: acc, accentText: readableOn(acc) } : {}),
    fx: {
      ...fx,
      reveal: (mode(use.map((p) => p.layout.reveal)) as typeof fx.reveal) ?? fx.reveal,
      hover: (mode(use.map((p) => p.layout.hover)) as typeof fx.hover) ?? fx.hover,
      motion: (mode(use.map((p) => p.layout.speed)) as typeof fx.motion) ?? fx.motion,
      density: mode(use.map((p) => p.layout.density)) ?? fx.density,
      ticker: use.filter((p) => p.layout.ticker).length * 2 > use.length ? true : fx.ticker,
    },
  };
}
