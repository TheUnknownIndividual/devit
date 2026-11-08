import { promises as fs } from "node:fs";
import path from "node:path";
import type { Dossier } from "../spec";
import type { LocalImage } from "../llm";
import { learnedShot } from "./learned";

// The reference library: sites the team collected as examples of good work (token sites and DeFi/brand pages),
// each studied for what makes it work: composition, type, colour use, framing devices, motion. Screenshots live in
// design-refs/ (1440×900 first screens). For each build a few references that suit the project are picked and shown
// to the art director and the code writer as inspiration: they borrow principles (how a hero is composed, how numbers
// are framed, how type carries the page), never the words, pictures, logos or markup.

export interface Inspiration {
  id: string;
  /** What kind of page it is, so a pick mixes token sites with product craft. */
  kind: "token" | "app" | "brand";
  light: boolean;
  /** Words matched against the project's mood, imagery and archetype. */
  moods: string[];
  /** Archetype ids (lib/design/principles.ts) this reference suits best. */
  archetypes: string[];
  /** How its first screen is composed. */
  hero: string;
  /** What is worth learning from it, specific and measurable where possible. */
  dna: string[];
  /** One of devit's own published sites that measured clean (lib/design/learned.ts), not a hand-picked one. */
  own?: boolean;
}

export const INSPIRATIONS: Inspiration[] = [
  // ---- token and meme sites ----
  {
    id: "5-star.fun", kind: "token", light: true,
    moods: ["playful", "cinematic", "retro", "illustrated", "loud", "crime", "postcard", "sunset", "game"],
    archetypes: ["poster-wall", "trading-card", "comic-panel", "y2k-chrome"],
    hero: "A 'Greetings from' postcard: a peach-to-lilac sunset wash, a gigantic chunky cream wordmark with a hard drop shadow centred on top, three tilted illustrated cards fanned out underneath it (left, centre, right) each with a small caption on the image.",
    dna: [
      "The wordmark is the art: ~180px heavy display, stroke + offset shadow, overlapping the picture cards behind it.",
      "Fanned cards: each rotated a few degrees, white border, caption set inside the bottom-left of the image.",
      "Nav as a thin cream bar with small caps links and one dark square button with an arrow.",
    ],
  },
  {
    id: "anonvoyage.top", kind: "token", light: false,
    moods: ["mysterious", "minimal", "noir", "secret", "clean", "monochrome", "travel"],
    archetypes: ["museum-placard", "luxury-house", "space-mission"],
    hero: "A dark dotted-grid page with one circular vignette in the centre framed by a thin ring and measurement arrows (like a technical drawing), then one wide rounded-letter headline under it. A tiny 'SHEET 01 / 04' folio top-left and a small SKIP button bottom-right.",
    dna: [
      "Everything centred on one framed artefact, lots of dark air around it.",
      "Drafting marks (dimension lines, arrows, ring) turn a simple picture into an exhibit.",
      "Folio and sheet numbers make it feel like a document you page through.",
    ],
  },
  {
    id: "barron1coin.com", kind: "token", light: false,
    moods: ["prestige", "gold", "patriotic", "serious", "classic", "coin", "movement"],
    archetypes: ["luxury-house", "museum-placard", "newspaper-front"],
    hero: "Split: left column with a tiny tracked eyebrow ('FAITH / FREEDOM / FUTURE'), a huge gold serif wordmark (Cinzel-like) with a metallic gradient, a caps subhead, two short paragraphs, a gold pill button + an outline button, and a CA chip. Right: the coin rendered huge, partly cropped by the edge, over a dark flag texture. A strip of five value columns with hairline separators at the bottom of the screen.",
    dna: [
      "Metallic gold gradient text on near-black, used only for the wordmark and buttons.",
      "Value strip: five equal columns, small caps titles in gold, one muted line each, vertical hairlines between.",
      "The CA lives in the hero as a slim mono chip with a copy icon.",
    ],
  },
  {
    id: "chillcats.lat", kind: "token", light: false,
    moods: ["calm", "photographic", "funny", "cozy", "cats", "understated", "deadpan"],
    archetypes: ["museum-placard", "editorial-magazine", "luxury-house"],
    hero: "A full-bleed photograph (two cats lying on a concrete floor next to a phone) with a dark gradient at the bottom; bottom-left a two-line headline in a heavy grotesk where the second line is a muted tint ('Market dumps. / Cats chill.'), a small 'Live from the floor' pill above it; bottom-right a short paragraph, two small buttons and the contract box.",
    dna: [
      "Deadpan copy over a quiet photo: the joke is the contrast between calm image and market panic.",
      "Two-tone headline: first line full colour, second line muted.",
      "Content anchored to the bottom edge of the hero, leaving the photo the top two thirds.",
    ],
  },
  {
    id: "get-lemniscate.tech", kind: "token", light: true,
    moods: ["premium", "gold", "minimal", "finance", "sleek", "editorial"],
    archetypes: ["swiss-grid", "luxury-house", "editorial-magazine"],
    hero: "White page; a floating capsule nav; a small '©2026' left and 'EVERLASTING OPTIONS' right on one baseline; then the wordmark set edge to edge across the whole width in a condensed gold-gradient grotesk (~200px). Below, a photographic band with three stat columns (∞ / 2 / 100%) with tiny labels, and the CA chip with Copy/Explorer at the bottom-right.",
    dna: [
      "Edge-to-edge wordmark: the name fills the full container width at one size.",
      "Tiny corner labels on a shared baseline frame the giant word like a print layout.",
      "Three big stat numerals with one-line labels, no boxes.",
    ],
  },
  {
    id: "gta6coin.net", kind: "token", light: false,
    moods: ["neon", "game", "cinematic", "synthwave", "pink", "hype", "countdown"],
    archetypes: ["broadcast-news", "game-hud", "y2k-chrome"],
    hero: "Hot pink/purple sunset city backdrop with silhouettes; a big dark rounded 'broadcast' screen frame in the centre (like a TV with a channel label); under it a gradient headline 'Countdown to the next chapter' and huge countdown digits.",
    dna: [
      "A framed screen as the hero object gives the page a 'broadcast' device.",
      "Countdown digits at display size are the signature number.",
      "Nav pills colour-coded by purpose (red/teal/blue/orange).",
    ],
  },
  {
    id: "gta6dog.fun", kind: "token", light: false,
    moods: ["neon", "game", "loud", "dog", "vice", "pink", "retro"],
    archetypes: ["poster-wall", "game-hud", "y2k-chrome"],
    hero: "Centred: a tiny star-rated tracked eyebrow, then a massive pink condensed wordmark with a gradient and inner shadow, a caps subtitle, two lines of story, a CA bar, three buttons, then a countdown panel with four big numerals and tiny unit labels. Illustrated character and palm silhouettes behind.",
    dna: [
      "Poster stack: eyebrow → enormous name → caps subtitle → story → CA → actions, all centred on one axis.",
      "Background illustration darkened so the type pops.",
      "Countdown as a rounded panel with numerals in the accent colour.",
    ],
  },
  {
    id: "hellhound.meme", kind: "token", light: false,
    moods: ["edgy", "gaming", "sharp", "dark", "esports", "mascot", "wolf"],
    archetypes: ["game-hud", "trading-card"],
    hero: "Split on a deep navy-to-purple gradient: left a large mascot logo with an italic esports wordmark under it; right the ticker in red, a short paragraph, a solid cyan button and an outline button, and a slim CA chip.",
    dna: [
      "Esports mascot language: angular italic wordmark, one cold accent (cyan) for the main button.",
      "Small social icon circles in the top bar instead of text links.",
    ],
  },
  {
    id: "hundonpump.com", kind: "token", light: true,
    moods: ["bold", "comic", "sky", "dog", "funny", "bright", "sticker"],
    archetypes: ["comic-panel", "poster-wall", "street-sticker"],
    hero: "Bright sky photo with clouds; left: a small bold eyebrow, a giant black-outlined white wordmark with a hard shadow, a second line inside a white boxed label with thick border ('CATCHES BEARS.'), one line of story, then a white card with thick black border holding the CA, a copy button and a wallet-preview line. Right: the 3D mascot dog sitting on a giant pill. A black stats bar at the bottom of the screen (price, mcap, liquidity, volume, holders).",
    dna: [
      "Thick black outlines + hard offset shadows on cards and labels (neo-brutalist sticker look).",
      "Boxed second line under the wordmark as a label.",
      "Stats bar pinned to the bottom of the first screen, mono numbers, dividers.",
    ],
  },
  {
    id: "makenoiz.xyz", kind: "token", light: false,
    moods: ["dark", "music", "grunge", "mysterious", "monochrome", "signal", "noise"],
    archetypes: ["terminal-shell", "luxury-house", "poster-wall"],
    hero: "Black, grainy, glitch-textured background; a tiny mono 'SIGNAL / LIVE' label top-left; in the centre a giant white heavy wordmark with a ghosted wider word set behind it in faint outline; a short two-line mono tagline and a tiny 'ENTER THE SIGNAL' link under it.",
    dna: [
      "Layered type: the giant word sits on top of a faded, larger word behind (depth from type alone).",
      "Mono micro-labels in corners, grain and scratch texture over everything.",
      "Monochrome: the only contrast is white type on black noise.",
    ],
  },
  {
    id: "oakagentkit.org", kind: "token", light: false,
    moods: ["illustrated", "nature", "forest", "warm", "storybook", "dev", "3d"],
    archetypes: ["storybook", "field-guide"],
    hero: "A full-bleed 3D diorama illustration (a glowing tree) fills the screen; top-left a small outline pill button and an install code block; bottom-left a giant chunky orange two-line title with a stacked text shadow set over the picture.",
    dna: [
      "Title over the bottom-left of a full-bleed picture, not next to it.",
      "Amber eyebrow with a short rule before section titles ('—— What it does').",
      "Translucent cream panels over deep green, serif section titles, numbered 01/02/03 rows with hairlines.",
    ],
  },
  {
    id: "otcdesks.cash", kind: "token", light: true,
    moods: ["product", "clean", "finance", "dashboard", "calm", "utility"],
    archetypes: ["trading-desk", "swiss-grid"],
    hero: "An app shell: left sidebar nav; a featured dark banner card at the top with a headline, a paragraph, a row of five small stat columns (label over number) and two buttons, with a small pixel illustration right; a pale green notice strip; then a grid of white cards each with a ticker, big price, tiny meta line and a round icon.",
    dna: [
      "Featured banner card holding the pitch plus a stats row with small caps labels.",
      "Cards with one big number each and quiet meta lines.",
    ],
  },
  {
    id: "pumpsgiving.fun", kind: "token", light: true,
    moods: ["warm", "festive", "mascot", "friendly", "charity", "orange", "illustrated"],
    archetypes: ["storybook", "trading-card"],
    hero: "Cream page; left: a small rounded eyebrow badge, a two-line heavy headline where the second line is in orange ('Giving thanks. / Giving back.'), a paragraph, a note line with an icon, a dark green pill button + outline button, small links and the token contract line. Right: a big sticker-style mascot badge with a little floating note card. An orange marquee strip at the bottom of the screen.",
    dna: [
      "Two-line headline with the second line in the accent colour.",
      "Mascot as a die-cut sticker badge, with small floating callout cards around it.",
      "Marquee band at the fold repeating the slogans.",
    ],
  },
  {
    id: "thegta6cat.com", kind: "token", light: false,
    moods: ["cinematic", "night", "street", "game", "cat", "neon", "photographic"],
    archetypes: ["poster-wall", "game-hud"],
    hero: "A full-screen moody street-at-night photograph (a cat on an ATM, wet road, palm trees); the logo is a compact neon-gradient lock-up centred in the scene with a small pill under it.",
    dna: [
      "The scene is the hero; the logo sits inside it like signage, small and centred.",
      "Atmosphere first: deep shadows, warm practical lights.",
    ],
  },
  {
    id: "thehunt.dev", kind: "token", light: false,
    moods: ["bold", "mascot", "cinematic", "warm", "game", "confident", "3d"],
    archetypes: ["poster-wall", "game-hud", "editorial-magazine"],
    hero: "Split on a warm brown gradient: left a tiny caps eyebrow, a huge tight two-line wordmark (the second line italic and a peach tint, ~150px), a bold two-line slogan, a short paragraph, a peach button with an arrow + a text link; right the 3D mascot portrait large, bleeding off the right and bottom edges. Tiny meta text bottom-left and bottom-right.",
    dna: [
      "Mascot bleeds off the edge and is cut by the frame, which makes it feel big.",
      "Wordmark with the second line italic and tinted; leading about 0.85.",
      "Corner meta text (dates, notes) in tiny caps frames the composition.",
    ],
  },
  {
    id: "three.ws", kind: "token", light: false,
    moods: ["os", "desktop", "cozy", "playful", "interface", "autumn", "dashboard"],
    archetypes: ["game-hud", "terminal-shell", "y2k-chrome"],
    hero: "Like a lock screen: a big clock with the date on a warm illustrated autumn backdrop; under it a translucent rounded panel with an avatar greeting, three option pills, then a grid of 'app' tiles (icon, name, one line) and a status bar at the bottom with price and a search hint.",
    dna: [
      "The site as an operating system: tiles, dock, status bar, a clock.",
      "Warm illustration behind a single translucent panel keeps it readable.",
    ],
  },
  {
    id: "trypools.fun", kind: "token", light: false,
    moods: ["tech", "pixel", "launchpad", "green", "terminal", "product"],
    archetypes: ["terminal-shell", "trading-desk", "arcade-cabinet"],
    hero: "Dark page; left: a tiny green eyebrow, a two-line pixel/bitmap display headline, two short lines and one green button; right: a 3D glossy green droplet with a small stat card overlapping it (1% fee). A long row of four stat cells with pixel numerals under the hero.",
    dna: [
      "Pixel display face for headlines and numerals, plain grotesk for body.",
      "A small stat card overlapping the hero object.",
      "A segmented row of numbered facts below the fold line.",
    ],
  },
  {
    id: "viceinumeme.lol", kind: "token", light: false,
    moods: ["synthwave", "retro", "neon", "80s", "sunset", "playful"],
    archetypes: ["y2k-chrome", "arcade-cabinet"],
    hero: "Black sky; a neon pink script headline glowing in the centre; a striped retro sunset disc below with two buttons sitting on it; a magenta perspective grid floor.",
    dna: [
      "One cohesive retro scene built from CSS shapes: striped sun, perspective grid, neon script.",
      "Buttons placed on the artwork instead of in a separate row.",
    ],
  },
  // ---- product and brand craft ----
  {
    id: "www.agoradex.app", kind: "app", light: false,
    moods: ["professional", "data", "fomo", "launchpad", "terminal", "live"],
    archetypes: ["trading-desk", "broadcast-news"],
    hero: "A featured-token banner: a large rounded card with a soft gradient, the token logo and big name with a verified badge, and a stats panel with small caps labels (MARKET CAP, 24H VOLUME, 24H CHANGE, TRADES 24H); a ranked list in a right rail; filter chips with counts above.",
    dna: [
      "Calm type at 11–15px, every number live, small caps labels: reads like a terminal without shouting.",
      "Card shadow: inset 1px top highlight + soft 10px/30px drop.",
      "A status bar at the bottom (block, price) as a quiet live signal.",
    ],
  },
  {
    id: "www.alchemy.com", kind: "app", light: true,
    moods: ["corporate", "clean", "trust", "platform", "light", "product"],
    archetypes: ["swiss-grid", "trading-desk"],
    hero: "White with a pale lavender wash; left a large weight-400 headline over two lines, a paragraph, a small blue button and a 'Talk to sales >' text link; right a product dashboard screen with floating stat cards overlapping its edge.",
    dna: [
      "Light-weight (400) large headlines feel confident and expensive.",
      "Stats strip: big light numbers separated by vertical hairlines, no boxes.",
      "Two-tone section titles (second half grey).",
    ],
  },
  {
    id: "infinex.xyz", kind: "app", light: false,
    moods: ["consumer", "sleek", "dark", "orange", "app", "premium"],
    archetypes: ["luxury-house", "trading-desk"],
    hero: "Pure black; left a 48px two-sentence headline on two lines, one line of support, an orange pill + platform icons row, a 'secured by' line and a roadmap teaser card; right the app itself (phone + desktop window) bleeding off the right edge.",
    dna: [
      "Floating capsule nav: links inside a rounded pill in the middle.",
      "Product bleeding off the edge gives scale without a giant headline.",
      "Generous radii (20/24/40px) and one hot accent on black.",
    ],
  },
  {
    id: "musebook.me", kind: "brand", light: true,
    moods: ["warm", "storybook", "cozy", "paper", "friendly", "community", "illustrated"],
    archetypes: ["storybook", "editorial-magazine", "zine-collage"],
    hero: "Cream paper; left: a tracked terracotta eyebrow, a ~58px serif headline whose last word is terracotta, a paragraph, a progress bar, live counter chips, and a peach-tinted contract card with copy and explorer link; right: the illustration in a rounded frame with a tilted taped paper caption and small live activity cards laid over its lower part.",
    dna: [
      "Last word of the headline in the accent colour.",
      "Taped, tilted caption on the hero picture; activity cards overlapping the frame.",
      "Warm shadows rgba(60,40,20,.1), radii 14/18/999.",
    ],
  },
  {
    id: "hmmmm.fun", kind: "brand", light: true,
    moods: ["playful", "cream", "meme", "friendly", "cat", "thinking", "soft"],
    archetypes: ["storybook", "zine-collage", "street-sticker"],
    hero: "Cream; left: a pill eyebrow badge, a heavy Fraunces wordmark (~96px, tight tracking), a one-line joke, three pill buttons (one solid green), a CA bar; right: the photo in a round blob mask with thick white border and tilted sticker labels on it ('hmm...', 'the thinking cat').",
    dna: [
      "Organic blob mask (border-radius: 42% 58% 46% 54% / 48% 44% 56% 52%) for the hero picture.",
      "Tilted sticker labels placed on the image edge.",
      "A centred serif 'should i?' section with one big round button as an interactive moment.",
    ],
  },
  {
    id: "family.co", kind: "brand", light: true,
    moods: ["friendly", "illustrated", "colourful", "playful", "consumer", "clean"],
    archetypes: ["storybook", "y2k-chrome"],
    hero: "White; a centred block (68px headline at −1.36 tracking, a two-line paragraph, a black pill + a text button) with colourful flat illustrations (mascots, coins, icons) scattered in clusters to the left and right.",
    dna: [
      "Illustrations as scattered clusters framing a calm centred message.",
      "Black and cream pill buttons, tight negative tracking on the headline.",
    ],
  },
  {
    id: "phantom.com", kind: "brand", light: true,
    moods: ["soft", "premium", "lavender", "friendly", "consumer", "rounded"],
    archetypes: ["luxury-house", "storybook"],
    hero: "The hero is a big rounded dark media card inset from the page edges (32px radius) with a candlestick pattern inside; a small line above a large centred three-line headline in white, and one lavender pill button.",
    dna: [
      "Hero inside an inset rounded media card rather than full bleed.",
      "Lavender soft palette, 32px radii, slow 400ms hovers.",
    ],
  },
  {
    id: "rainbow.me", kind: "brand", light: false,
    moods: ["app", "dark", "phone", "clean", "consumer"],
    archetypes: ["luxury-house", "trading-desk"],
    hero: "Dark; a phone mockup on the left showing the real app UI; a 44px bold three-line headline on the right with a muted paragraph; a vertical section nav list at the far right.",
    dna: [
      "The product shown in a phone frame as the hero image.",
      "A vertical section index on the right edge doubles as navigation.",
    ],
  },
  {
    id: "relay.link", kind: "app", light: true,
    moods: ["fast", "clean", "bold", "italic", "purple", "product"],
    archetypes: ["swiss-grid", "broadcast-news"],
    hero: "White; left a three-line italic uppercase-feel headline with the last line in purple ('Move anything. / Any chain. / Instantly.'), a paragraph, two buttons (purple, black); right the live swap widget; a greyscale trusted-by logo row at the bottom.",
    dna: [
      "Short staccato lines, last one in the accent.",
      "The working widget is the hero's right column (we have the buy widget for this).",
    ],
  },
  {
    id: "pro.alignui.com", kind: "app", light: true,
    moods: ["clean", "product", "precise", "soft", "grid"],
    archetypes: ["swiss-grid", "museum-placard"],
    hero: "Centred: a floating pill nav, a small announcement pill, two tiny meta badges, a 72px weight-550 headline (−2.16 tracking), a line, one dark button; then a browser-window frame showing UI cards; faint ruler-style grid lines down both sides.",
    dna: [
      "Ruler-style vertical guide lines and dashed dividers make the grid visible.",
      "Layered soft shadows; a browser frame to present content.",
    ],
  },
];

const SHOT_DIR = path.join(process.cwd(), "design-refs");

const words = (s: string) => s.toLowerCase().match(/[a-z]{3,}/g) ?? [];

/**
 * Picks `n` references for this project: ones whose archetypes include the seed get a strong pull, mood words that
 * appear in the dossier (tone, imagery, subject) add weight, a match on light/dark adds a little, recent picks are
 * pushed down, and a random jitter keeps rebuilds fresh. At least one token site and at most two of one kind.
 */
/**
 * `extra`: devit's own published sites that earned a place (lib/design/learned.ts). At most one of them is picked,
 * so the hand-picked library keeps setting the bar and the sites don't drift towards each other.
 */
export function pickInspiration(d: Dossier | null, archetype: string, light: boolean | null, recent: string[] = [], n = 3, extra: Inspiration[] = []): Inspiration[] {
  const text = d ? new Set(words([d.oneLiner, d.whatItIs, d.subject?.kind, d.subject?.description, d.imagery?.artStyle, ...(d.imagery?.motifs ?? []), ...(d.tone?.adjectives ?? [])].join(" "))) : new Set<string>();
  const scored = [...INSPIRATIONS, ...extra].map((r) => {
    let s = Math.random() * 1.5;
    if (r.archetypes.includes(archetype)) s += 3;
    // Learned sites carry many more mood words than hand-picked ones; cap them so they assist rather than dominate.
    const moodHits = r.moods.filter((m) => text.has(m)).length;
    s += r.own ? Math.min(moodHits, 2) - 0.5 : moodHits;
    if (light != null && r.light === light) s += 0.7;
    if (recent.includes(r.id)) s -= 2.5;
    return { r, s };
  }).sort((a, b) => b.s - a.s);
  const out: Inspiration[] = [];
  const kinds = new Map<string, number>();
  for (const { r } of scored) {
    if (out.length >= n) break;
    if ((kinds.get(r.kind) ?? 0) >= 2) continue;
    if (r.own && out.some((o) => o.own)) continue;
    out.push(r);
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  }
  if (!out.some((r) => r.kind === "token")) {
    const t = scored.find(({ r }) => r.kind === "token");
    if (t) out[out.length - 1] = t.r;
  }
  return out;
}

/** The references as text for a prompt. */
export function inspirationText(list: Inspiration[]): string {
  return list.map((r, i) => `REFERENCE ${i + 1}: ${r.id} (${r.own ? "an earlier devit site that measured clean; learn its craft, never reuse its subject or concept" : r.kind === "token" ? "token site" : "product/brand site"}, ${r.light ? "light" : "dark"})
  first screen: ${r.hero}
  what works: ${r.dna.join(" ")}`).join("\n");
}

/** First-screen screenshots of the references, for models that can see. Missing files are skipped. */
export async function inspirationShots(list: Inspiration[]): Promise<LocalImage[]> {
  const out = await Promise.all(list.map(async (r) => {
    try {
      const data = await fs.readFile(r.own ? learnedShot(r.id) : path.join(SHOT_DIR, `${r.id}.jpg`));
      return { media: "image/jpeg", data: data.toString("base64"), label: `Reference screenshot: ${r.id}` } as LocalImage;
    } catch {
      return null;
    }
  }));
  return out.filter((x): x is LocalImage => !!x);
}

export const INSPIRATION_RULES = `How to use the references: they are examples of excellent craft the team collected, picked because they suit this project. Learn from their composition, hierarchy, framing devices, type scale and finish, and from what makes each feel considered. Borrow principles, never content: do not copy their words, names, logos, pictures, colours wholesale or layouts one-to-one, and never mention them on the site. The project's own world and the brief's archetype stay in charge; a reference is a push in quality, not a template.`;
