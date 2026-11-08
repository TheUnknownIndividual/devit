// The type a generated site may use: curated Google Fonts pairings tagged by mood. The art director picks one by id
// (never a free font name), so every site gets type that was chosen on purpose and always loads. Inter, Roboto, Open
// Sans, Lato and Space Grotesk never lead: they are what every generated site already looks like.
//
// `params` are Google Fonts css2 family params with axes/weights that exist for that family; each loads through its
// own <link>, so one bad family can never take the others down.

export interface FontPair {
  id: string;
  display: string;
  body: string;
  mono: string;
  moods: string[];
  /** One line for the art director: what this pairing feels like. */
  feel: string;
  params: string[];
}

const MONO = {
  jet: { name: "JetBrains Mono", p: "family=JetBrains+Mono:wght@400..700" },
  space: { name: "Space Mono", p: "family=Space+Mono:wght@400;700" },
  plex: { name: "IBM Plex Mono", p: "family=IBM+Plex+Mono:wght@400;500;700" },
  martian: { name: "Martian Mono", p: "family=Martian+Mono:wght@400..700" },
  dm: { name: "DM Mono", p: "family=DM+Mono:wght@400;500" },
  redhat: { name: "Red Hat Mono", p: "family=Red+Hat+Mono:wght@400..700" },
  vt: { name: "VT323", p: "family=VT323" },
} as const;

type M = keyof typeof MONO;
const pair = (id: string, display: [string, string], body: [string, string] | null, mono: M, moods: string[], feel: string): FontPair => ({
  id,
  display: display[0],
  body: (body ?? display)[0],
  mono: MONO[mono].name,
  moods,
  feel,
  params: [...new Set([display[1], ...(body ? [body[1]] : []), MONO[mono].p])],
});

const F = {
  fraunces: ["Fraunces", "family=Fraunces:opsz,wght@9..144,300..900"],
  instrSerif: ["Instrument Serif", "family=Instrument+Serif:ital@0;1"],
  instrSans: ["Instrument Sans", "family=Instrument+Sans:wght@400..700"],
  dmSerif: ["DM Serif Display", "family=DM+Serif+Display:ital@0;1"],
  dmSans: ["DM Sans", "family=DM+Sans:wght@400..700"],
  playfair: ["Playfair Display", "family=Playfair+Display:wght@400..900"],
  syne: ["Syne", "family=Syne:wght@400..800"],
  archivo: ["Archivo", "family=Archivo:wdth,wght@62..125,400..900"],
  archivoBlack: ["Archivo Black", "family=Archivo+Black"],
  bricolage: ["Bricolage Grotesque", "family=Bricolage+Grotesque:wght@400..800"],
  unbounded: ["Unbounded", "family=Unbounded:wght@300..900"],
  bungee: ["Bungee", "family=Bungee"],
  rubikMono: ["Rubik Mono One", "family=Rubik+Mono+One"],
  pressStart: ["Press Start 2P", "family=Press+Start+2P"],
  silkscreen: ["Silkscreen", "family=Silkscreen:wght@400;700"],
  pixelify: ["Pixelify Sans", "family=Pixelify+Sans:wght@400..700"],
  bebas: ["Bebas Neue", "family=Bebas+Neue"],
  anton: ["Anton", "family=Anton"],
  oswald: ["Oswald", "family=Oswald:wght@300..700"],
  barlowCond: ["Barlow Condensed", "family=Barlow+Condensed:wght@500;700;800"],
  barlow: ["Barlow", "family=Barlow:wght@400;500;600"],
  manrope: ["Manrope", "family=Manrope:wght@400..800"],
  outfit: ["Outfit", "family=Outfit:wght@300..800"],
  sora: ["Sora", "family=Sora:wght@300..800"],
  jakarta: ["Plus Jakarta Sans", "family=Plus+Jakarta+Sans:wght@400..800"],
  figtree: ["Figtree", "family=Figtree:wght@400..800"],
  onest: ["Onest", "family=Onest:wght@400..800"],
  workSans: ["Work Sans", "family=Work+Sans:wght@400..700"],
  franklin: ["Libre Franklin", "family=Libre+Franklin:wght@400..800"],
  newsreader: ["Newsreader", "family=Newsreader:opsz,wght@6..72,300..800"],
  cormorant: ["Cormorant Garamond", "family=Cormorant+Garamond:wght@400;600;700"],
  ebGaramond: ["EB Garamond", "family=EB+Garamond:wght@400..800"],
  literata: ["Literata", "family=Literata:opsz,wght@7..72,300..800"],
  lora: ["Lora", "family=Lora:wght@400..700"],
  chakra: ["Chakra Petch", "family=Chakra+Petch:wght@400;600;700"],
  orbitron: ["Orbitron", "family=Orbitron:wght@400..900"],
  audiowide: ["Audiowide", "family=Audiowide"],
  michroma: ["Michroma", "family=Michroma"],
  righteous: ["Righteous", "family=Righteous"],
  lilita: ["Lilita One", "family=Lilita+One"],
  fredoka: ["Fredoka", "family=Fredoka:wght@400..700"],
  baloo: ["Baloo 2", "family=Baloo+2:wght@400..800"],
  nunito: ["Nunito", "family=Nunito:wght@400..900"],
  luckiest: ["Luckiest Guy", "family=Luckiest+Guy"],
  bangers: ["Bangers", "family=Bangers"],
  comicNeue: ["Comic Neue", "family=Comic+Neue:wght@400;700"],
  marker: ["Permanent Marker", "family=Permanent+Marker"],
  caveat: ["Caveat", "family=Caveat:wght@400..700"],
  shrikhand: ["Shrikhand", "family=Shrikhand"],
  abril: ["Abril Fatface", "family=Abril+Fatface"],
  ultra: ["Ultra", "family=Ultra"],
  rye: ["Rye", "family=Rye"],
  monoton: ["Monoton", "family=Monoton"],
  majorMono: ["Major Mono Display", "family=Major+Mono+Display"],
  darker: ["Darker Grotesque", "family=Darker+Grotesque:wght@400..900"],
  hanken: ["Hanken Grotesk", "family=Hanken+Grotesk:wght@400..800"],
  schibsted: ["Schibsted Grotesk", "family=Schibsted+Grotesk:wght@400..900"],
  redhatDisplay: ["Red Hat Display", "family=Red+Hat+Display:wght@400..900"],
  gloock: ["Gloock", "family=Gloock"],
  youngSerif: ["Young Serif", "family=Young+Serif"],
  zilla: ["Zilla Slab", "family=Zilla+Slab:wght@400;600;700"],
  alfaSlab: ["Alfa Slab One", "family=Alfa+Slab+One"],
  blackOps: ["Black Ops One", "family=Black+Ops+One"],
  staatliches: ["Staatliches", "family=Staatliches"],
  tiltWarp: ["Tilt Warp", "family=Tilt+Warp"],
  delaGothic: ["Dela Gothic One", "family=Dela+Gothic+One"],
  krona: ["Krona One", "family=Krona+One"],
  lexend: ["Lexend", "family=Lexend:wght@300..800"],
  tektur: ["Tektur", "family=Tektur:wght@400..900"],
  plexSans: ["IBM Plex Sans", "family=IBM+Plex+Sans:wght@400;500;700"],
  spaceGrotesk: ["Space Grotesk", "family=Space+Grotesk:wght@400..700"],
} as const satisfies Record<string, readonly [string, string]>;

const f = (k: keyof typeof F): [string, string] => [F[k][0], F[k][1]];

export const FONT_PAIRS: FontPair[] = [
  pair("fraunces-instrument", f("fraunces"), f("instrSans"), "jet", ["editorial", "warm", "luxe", "storybook"], "soft wonky serif headlines, crisp modern body: a magazine with a sense of humour"),
  pair("instrument-serif-dm", f("instrSerif"), f("dmSans"), "dm", ["editorial", "luxe", "minimal", "calm"], "tall elegant serif with italics, quiet sans: a gallery placard"),
  pair("dmserif-figtree", f("dmSerif"), f("figtree"), "dm", ["editorial", "warm", "nature"], "high-contrast display serif, friendly body"),
  pair("playfair-franklin", f("playfair"), f("franklin"), "plex", ["luxe", "newspaper", "editorial"], "broadsheet: dramatic serif, sturdy news sans"),
  pair("newsreader-hanken", f("newsreader"), f("hanken"), "plex", ["newspaper", "editorial", "finance", "calm"], "serious reading serif and a clean grotesk: a research note"),
  pair("cormorant-manrope", f("cormorant"), f("manrope"), "dm", ["luxe", "dark-fantasy", "calm"], "thin classical serif, very elegant; needs big sizes"),
  pair("garamond-work", f("ebGaramond"), f("workSans"), "plex", ["storybook", "fantasy", "nature", "warm"], "old-book serif with a working sans: lore and legend"),
  pair("gloock-onest", f("gloock"), f("onest"), "jet", ["editorial", "loud", "luxe"], "fat contrasty serif display, neutral body"),
  pair("young-serif-outfit", f("youngSerif"), f("outfit"), "dm", ["warm", "cute", "storybook"], "chunky soft serif, round geometric body"),
  pair("syne-manrope", f("syne"), f("manrope"), "jet", ["futurist", "art", "loud"], "wide eccentric art-school display, smooth body"),
  pair("unbounded-onest", f("unbounded"), f("onest"), "martian", ["futurist", "techno", "y2k", "loud"], "wide round tech display, airy body"),
  pair("bricolage-dm", f("bricolage"), f("dmSans"), "dm", ["playful", "warm", "art", "loud"], "characterful grotesk with ink-trap quirks"),
  pair("archivo-wide", f("archivo"), f("archivo"), "space", ["brutal", "sport", "swiss", "loud"], "one family, widths stretched for headlines: poster grid"),
  pair("archivoblack-plex", f("archivoBlack"), f("plexSans"), "plex", ["brutal", "swiss", "terminal"], "heavy black grotesk, technical body"),
  pair("schibsted-plex", f("schibsted"), f("plexSans"), "plex", ["swiss", "finance", "minimal", "newspaper"], "Scandinavian news grotesk, precise"),
  pair("redhat-lexend", f("redhatDisplay"), f("lexend"), "redhat", ["clean", "finance", "friendly"], "confident display sans, very readable body"),
  pair("sora-jakarta", f("sora"), f("jakarta"), "jet", ["clean", "finance", "protocol", "futurist"], "geometric precise display with a warm UI body"),
  pair("darker-figtree", f("darker"), f("figtree"), "jet", ["editorial", "minimal", "fashion"], "condensed tall grotesk, fashion-magazine headlines"),
  pair("bebas-barlow", f("bebas"), f("barlow"), "space", ["sport", "loud", "poster", "military"], "tall all-caps condensed: fight-night poster"),
  pair("anton-workSans", f("anton"), f("workSans"), "space", ["loud", "brutal", "poster", "meme"], "massive condensed impact headlines"),
  pair("oswald-lora", f("oswald"), f("lora"), "plex", ["newspaper", "western", "grunge"], "condensed headline sans over a bookish serif"),
  pair("barlowcond-barlow", f("barlowCond"), f("barlow"), "jet", ["techno", "sport", "industrial", "military"], "engineered condensed family: spec sheets and HUDs"),
  pair("staatliches-spacegrotesk", f("staatliches"), f("spaceGrotesk"), "space", ["poster", "retro", "industrial"], "stencil-ish caps poster type"),
  pair("blackops-chakra", f("blackOps"), f("chakra"), "space", ["military", "gaming", "grunge"], "stencil military display, angular body"),
  pair("orbitron-chakra", f("orbitron"), f("chakra"), "jet", ["futurist", "gaming", "space", "techno"], "sci-fi square display, angular tech body"),
  pair("audiowide-sora", f("audiowide"), f("sora"), "jet", ["y2k", "futurist", "racing"], "rounded racing display"),
  pair("michroma-outfit", f("michroma"), f("outfit"), "martian", ["futurist", "luxe", "space", "minimal"], "wide extended display, cosmic and calm"),
  pair("tektur-plex", f("tektur"), f("plexSans"), "plex", ["techno", "gaming", "terminal"], "cut-corner tech display"),
  pair("pressstart-vt", f("pressStart"), f("spaceGrotesk"), "vt", ["arcade", "retro", "pixel", "gaming"], "8-bit arcade headings, readable body"),
  pair("silkscreen-jet", f("silkscreen"), f("dmSans"), "jet", ["pixel", "retro", "terminal", "cute"], "tiny pixel caps, clean body: a handheld console"),
  pair("pixelify-lexend", f("pixelify"), f("lexend"), "vt", ["pixel", "cute", "gaming", "playful"], "chunky pixel display that stays friendly"),
  pair("majormono-plex", f("majorMono"), f("plexSans"), "plex", ["terminal", "hacker", "minimal"], "odd mixed-case monospace display: a hacker zine"),
  pair("bungee-nunito", f("bungee"), f("nunito"), "space", ["street", "loud", "arcade", "signage"], "vertical-metric signage display, round body"),
  pair("rubikmono-outfit", f("rubikMono"), f("outfit"), "space", ["loud", "meme", "brutal", "playful"], "fat square caps: sticker energy"),
  pair("luckiest-nunito", f("luckiest"), f("nunito"), "space", ["cartoon", "meme", "playful", "cute"], "bouncy cartoon caps"),
  pair("bangers-comicneue", f("bangers"), f("comicNeue"), "space", ["comic", "meme", "loud", "superhero"], "comic-book action lettering"),
  pair("lilita-fredoka", f("lilita"), f("fredoka"), "space", ["cute", "playful", "cartoon", "kids"], "soft heavy rounded display, bubbly body"),
  pair("fredoka-baloo", f("fredoka"), f("baloo"), "space", ["cute", "friendly", "cartoon"], "all-round soft family, candy-like"),
  pair("righteous-nunito", f("righteous"), f("nunito"), "space", ["retro", "70s", "groovy", "playful"], "retro rounded display, groovy"),
  pair("shrikhand-dm", f("shrikhand"), f("dmSans"), "dm", ["retro", "70s", "food", "warm", "loud"], "fat italic script-ish display: diner sign"),
  pair("abril-lora", f("abril"), f("lora"), "plex", ["retro", "luxe", "editorial"], "didone fat-face poster headlines"),
  pair("ultra-zilla", f("ultra"), f("zilla"), "plex", ["western", "retro", "loud", "wanted-poster"], "slab wanted-poster headlines"),
  pair("rye-zilla", f("rye"), f("zilla"), "plex", ["western", "saloon", "grunge"], "ornamental western display, slab body"),
  pair("alfaslab-workSans", f("alfaSlab"), f("workSans"), "space", ["loud", "sport", "retro"], "heavy slab, college-athletic"),
  pair("marker-caveat", f("marker"), f("hanken"), "space", ["handmade", "zine", "grunge", "meme"], "marker scrawl headlines, clean body: a zine"),
  pair("caveat-literata", f("caveat"), f("literata"), "jet", ["handmade", "storybook", "warm", "journal"], "handwritten notes over a book serif: a field journal"),
  pair("monoton-outfit", f("monoton"), f("outfit"), "space", ["neon", "retro", "80s", "nightlife"], "inline neon tube display"),
  pair("delagothic-lexend", f("delaGothic"), f("lexend"), "jet", ["anime", "japan", "loud", "street"], "heavy Japanese-style gothic display"),
  pair("krona-figtree", f("krona"), f("figtree"), "martian", ["y2k", "futurist", "clean"], "wide flat Y2K display"),
  pair("tiltwarp-onest", f("tiltWarp"), f("onest"), "dm", ["playful", "3d", "y2k", "loud"], "warped chunky display with depth"),
];

/** Display fonts no site may lead with (they are the generic look). Body use is fine. */
export const BANNED_DISPLAY = ["Inter", "Roboto", "Open Sans", "Lato", "Space Grotesk", "Arial", "Helvetica", "system-ui"];

export function fontPair(id: string | null | undefined): FontPair | null {
  return FONT_PAIRS.find((p) => p.id === id) ?? null;
}

/** The menu for the art director: id, feel, moods; one line each. */
export function fontMenu(): string {
  return FONT_PAIRS.map((p) => `${p.id}: ${p.display} + ${p.body} (${p.moods.join(", ")}) - ${p.feel}`).join("\n");
}

/** The best pairing for a set of mood words, avoiding recently used ids; deterministic for the same input. */
export function pairForMoods(moods: string[], avoid: string[] = []): FontPair {
  const want = new Set(moods.map((m) => m.toLowerCase()));
  const scored = FONT_PAIRS.filter((p) => !avoid.includes(p.id)).map((p) => ({ p, s: p.moods.filter((m) => want.has(m)).length }));
  scored.sort((a, b) => b.s - a.s);
  return (scored[0]?.p ?? FONT_PAIRS[0]);
}

/** CSS font stacks for a pair, with fallbacks. */
export function fontStacks(p: FontPair): { display: string; body: string; mono: string } {
  const q = (n: string) => (/\s/.test(n) ? `"${n}"` : n);
  return {
    display: `${q(p.display)}, ${q(p.body)}, system-ui, sans-serif`,
    body: `${q(p.body)}, system-ui, sans-serif`,
    mono: `${q(p.mono)}, ui-monospace, monospace`,
  };
}
