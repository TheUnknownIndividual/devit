import { THEMES, fitAccent, fxOf, readableOn } from "./themes";
import type { Block, BlockType, RefRead, Theme, ThemeId } from "./spec";

// A reference site's read (lib/reference.ts) turned into this site's look: the style closest to it, then its
// palette, type, corners, surfaces, scroll reveal, hover and marquee laid over that style, and the site's sections put
// in the order the reference uses. The team's own things stay theirs: their brand colour beats the reference's accent,
// and their words, logo and pictures are never replaced by the reference's.

const gf = (q: string) => `https://fonts.googleapis.com/css2?${q}&display=swap`;

const hexOk = (h: string | null | undefined): h is string => !!h && /^#[0-9a-f]{6}$/i.test(h);
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** The style a reference reads closest to, or null when nothing in it points anywhere. */
export function themeForRef(r: RefRead): ThemeId | null {
  const display = `${r.fonts.display ?? ""} ${r.fonts.google.join(" ")}`.toLowerCase();
  if (/press start|vt323|pixel|silkscreen|8.?bit/.test(display)) return "retro";
  if (r.surface === "glass") return "glass";
  if (r.surface === "offset") return "brutal";
  if (/mono|code|courier/.test(display)) return r.palette.dark ? "terminal" : "brutal";
  if (/fredoka|nunito|baloo|quicksand|comic|chewy|rounded/.test(display)) return "cozy";
  if (r.palette.dark === true) return (r.radius ?? 0) >= 16 ? "glass" : "degen";
  if (r.palette.dark === false) return (r.radius ?? 0) >= 16 ? "app" : "clean";
  return null;
}

// A font the reference self-hosts can't be loaded by name; the closest Google font of the same kind stands in.
const STAND_INS: Array<[RegExp, string]> = [
  [/bangers|comic|marker|luckiest|cartoon/i, "Bangers"],
  [/anton|bebas|oswald|impact|league gothic|condensed|compressed|druk|knockout/i, "Anton"],
  [/playfair|serif|garamond|didot|bodoni|times|georgia|cormorant/i, "Playfair Display"],
  [/mono|code|courier/i, "Space Mono"],
  [/fredoka|nunito|baloo|quicksand|rounded/i, "Fredoka"],
  [/clash|cabinet|satoshi|general sans|switzer|neue|helvetica|inter|geist|sf pro|aeonik/i, "Inter"],
  [/syne|unbounded|space grotesk|archivo|grotesk/i, "Space Grotesk"],
];

async function googleHas(family: string): Promise<boolean> {
  try {
    const r = await fetch(gf(`family=${encodeURIComponent(family).replace(/%20/g, "+")}`), { signal: AbortSignal.timeout(4_000) });
    return r.ok;
  } catch { return false; }
}

/** A font family as Google Fonts can serve it: the family itself when Google has it, else a stand-in of its kind. */
async function loadable(family: string | null): Promise<string | null> {
  if (!family) return null;
  const clean = family.replace(/["']/g, "").replace(/\s+(Variable|VF|Regular|Bold|Black|Display)$/i, "").trim();
  if (!clean || /^(system-ui|-apple-system|sans-serif|serif|monospace|arial|helvetica)$/i.test(clean)) return null;
  if (await googleHas(clean)) return clean;
  return STAND_INS.find(([re]) => re.test(clean))?.[1] ?? null;
}

const fam = (f: string, fallback: string) => `'${f}', ${fallback}`;

/** The reference's look laid over the style closest to it. `brand` (the team's own colour) beats the reference's accent. */
export async function themeFromRef(r: RefRead, cur: Theme, brand: string | null): Promise<Theme> {
  const id = themeForRef(r) ?? cur.id;
  const base = THEMES[id];
  const dark = r.palette.dark ?? base.dark;
  const bg = hexOk(r.palette.bg) && (lum(r.palette.bg) < 0.45) === dark ? r.palette.bg : base.bg;
  const text = hexOk(r.palette.text) && Math.abs(lum(r.palette.text) - lum(bg)) > 0.45 ? r.palette.text : dark ? "#F5F5F5" : "#121212";
  const surface = hexOk(r.palette.surface) && Math.abs(lum(r.palette.surface) - lum(bg)) < 0.25 ? r.palette.surface : mix(bg, text, dark ? 0.06 : 0.03);
  const muted = hexOk(r.palette.muted) && Math.abs(lum(r.palette.muted) - lum(bg)) > 0.25 ? r.palette.muted : mix(text, bg, 0.38);
  const border = mix(bg, text, dark ? 0.16 : 0.12);
  const accentRaw = brand ?? (hexOk(r.palette.accent) ? r.palette.accent : null) ?? base.accent;
  const accent = fitAccent(accentRaw, dark);
  const [display, body] = await Promise.all([loadable(r.fonts.display), loadable(r.fonts.body)]);
  const families = [display, body && body !== display ? body : null].filter((x): x is string => !!x);
  // Single-weight display faces are asked for without a weight axis (Google answers 400 to one they don't have).
  const query = (f: string) => `family=${f.replace(/ /g, "+")}${/^(Anton|Bangers|Bebas Neue|Luckiest Guy|Press Start 2P|VT323)$/.test(f) ? "" : ":wght@400;500;600;700"}`;
  const mono = base.fontsHref.split("?")[1]?.replace(/&display=swap$/, "").split("&").filter((q) => /Mono/.test(q)) ?? [];
  const fontsHref = families.length ? gf([...families.map(query), ...mono].join("&")) : base.fontsHref;
  const fx = fxOf(base);
  return {
    ...base,
    dark, bg, surface, text, muted, border, accent, accentText: readableOn(accent),
    radius: r.radius === null ? base.radius : Math.round(Math.min(40, Math.max(0, r.radius))),
    fontDisplay: display ? fam(display, base.fontDisplay) : base.fontDisplay,
    fontBody: body ? fam(body, "system-ui, sans-serif") : base.fontBody,
    fontsHref,
    uppercase: r.uppercase,
    fx: {
      ...fx,
      surface: r.surface ?? fx.surface,
      motion: r.motion.speed ?? fx.motion,
      reveal: r.motion.reveal ?? "rise",
      hover: r.motion.hover ?? undefined,
      ticker: r.motion.marquee || fx.ticker,
      parallax: r.motion.parallax || undefined,
    },
  };
}

// The reference's section kinds (reference.ts kindOf) as this site's blocks.
const KIND_BLOCK: Record<string, BlockType> = {
  hero: "hero", story: "story", how: "how", tokenomics: "tokenomics", roadmap: "roadmap", faq: "faq", socials: "socials",
  buy: "buy", chart: "chart", contract: "stats",
};

/** The block types the reference shows, in its order (first page first, then what other pages add). */
export function refBlockOrder(r: RefRead): BlockType[] {
  const out: BlockType[] = [];
  for (const p of r.pages) for (const s of p.sections) { const b = KIND_BLOCK[s.kind]; if (b && !out.includes(b)) out.push(b); }
  return out;
}

/**
 * The blocks put in the reference's order: blocks it also has follow its order; the rest keep their place after the
 * block they followed. The navigation stays first and the footer last.
 */
export function orderLike(blocks: Block[], order: BlockType[]): Block[] {
  if (order.length < 2) return blocks;
  const rank = new Map(order.map((t, i) => [t, i]));
  const nav = blocks.filter((b) => b.type === "nav");
  const foot = blocks.filter((b) => b.type === "footer");
  const mid = blocks.filter((b) => b.type !== "nav" && b.type !== "footer");
  const ranked = mid.filter((b) => rank.has(b.type)).sort((a, b) => rank.get(a.type)! - rank.get(b.type)!);
  const out: Block[] = [];
  let next = 0;
  for (const b of mid) out.push(rank.has(b.type) ? ranked[next++] : b);
  return [...nav, ...out, ...foot];
}

/** One line on what the reference lent the site, for the chat. */
export function refLine(r: RefRead, theme: Theme, reordered: boolean): string {
  const fonts = theme.fontDisplay.match(/'([^']+)'/)?.[1];
  const bits = [
    `took the look of ${r.host}${r.how === "html" ? " (from its HTML and CSS; a browser read would also catch its scroll effects)" : ""}`,
    r.notes.slice(0, 6).join(", "),
    fonts && !r.notes.slice(0, 6).some((n) => n.includes(fonts)) ? `headings in ${fonts}` : null,
    reordered ? "sections in its order" : null,
  ].filter(Boolean);
  return `I ${bits.join("; ")}. Your copy, logo and colour stay yours, and none of its text or pictures are used.`;
}
