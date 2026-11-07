import type { HeroLayout, Theme, ThemeFx, ThemeId } from "./spec";

const gf = (q: string) => `https://fonts.googleapis.com/css2?${q}&display=swap`;

// Eight styles. The four added on 2026-10-26 come from a study of 31 live sites: trading terminals (Axiom, GMGN,
// pump.fun, Meteora), wallet apps (MetaMask, Phantom, Rainbow, Aave), internet-native meme sites (SPX6900, fwog)
// and glassy DeFi (Uniswap, Raydium, Jupiter, Shib). Only measured traits are copied: type scale, radii, density,
// surfaces and motion; never anyone's text, art or logo.

export const THEMES: Record<ThemeId, Theme> = {
  degen: {
    id: "degen", dark: true,
    bg: "#0B0B0B", surface: "#161616", text: "#FFFFFF", muted: "#BDBDBD", border: "#2A2A2A",
    accent: "#FFE600", accentText: "#0B0B0B", radius: 0,
    fontDisplay: "'Anton', sans-serif", fontBody: "'Space Grotesk', system-ui, sans-serif", fontMono: "'JetBrains Mono', monospace",
    fontsHref: gf("family=Anton&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500"),
    uppercase: true,
    // Meme sites: a slogan marquee (Mog, Blackdragon, Bonk), a glow behind the mascot, a floating hero.
    fx: { bg: "glow", surface: "outline", motion: "bouncy", density: "regular", ticker: true, pill: false, transition: "angle", reveal: "scale", progress: true, stats: "strip" },
  },
  clean: {
    id: "clean", dark: false,
    bg: "#F6F7F4", surface: "#FFFFFF", text: "#14201A", muted: "#56645C", border: "#E3E6E0",
    accent: "#1A6B47", accentText: "#FFFFFF", radius: 20,
    fontDisplay: "'Manrope', system-ui, sans-serif", fontBody: "'Manrope', system-ui, sans-serif", fontMono: "'IBM Plex Mono', monospace",
    fontsHref: gf("family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "none", surface: "soft", motion: "calm", density: "airy", ticker: false, pill: false, transition: "fade", reveal: "fade", titles: "eyebrow" },
  },
  retro: {
    id: "retro", dark: true,
    bg: "#140C2B", surface: "#1D1240", text: "#F4EEFF", muted: "#C9BEEA", border: "#3B2370",
    accent: "#FF4FD8", accentText: "#140C2B", radius: 0,
    fontDisplay: "'Press Start 2P', monospace", fontBody: "'VT323', monospace", fontMono: "'VT323', monospace",
    fontsHref: gf("family=Press+Start+2P&family=VT323"),
    uppercase: true,
    fx: { bg: "grid", surface: "offset", motion: "snappy", density: "regular", ticker: true, pill: false, transition: "angle", reveal: "slide", progress: true, stats: "chips" },
  },
  cozy: {
    id: "cozy", dark: false,
    bg: "#F3F7E8", surface: "#FFFFFF", text: "#1F2A14", muted: "#4A5A38", border: "#1F2A14",
    accent: "#1F2A14", accentText: "#F3F7E8", radius: 18,
    fontDisplay: "'Fredoka', system-ui, sans-serif", fontBody: "'Fredoka', system-ui, sans-serif", fontMono: "'IBM Plex Mono', monospace",
    fontsHref: gf("family=Fredoka:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "dots", surface: "offset", motion: "bouncy", density: "regular", ticker: false, pill: false, transition: "wave", reveal: "rise", stats: "chips" },
  },
  // Axiom #06070B, GMGN #121212, pump.fun #0B0B0E: near-black, Geist, 12-14px text, 4-6px radii, no shadows.
  terminal: {
    id: "terminal", dark: true,
    bg: "#07080C", surface: "#0F1116", text: "#F2F3F5", muted: "#8A8F99", border: "#1D2028",
    accent: "#5B7CFF", accentText: "#FFFFFF", radius: 6,
    fontDisplay: "'Geist', system-ui, sans-serif", fontBody: "'Geist', system-ui, sans-serif", fontMono: "'Geist Mono', monospace",
    fontsHref: gf("family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "glow", surface: "outline", motion: "snappy", density: "compact", ticker: true, pill: false, transition: "none", reveal: "fade", intro: false, stats: "panel" },
  },
  // MetaMask 180px condensed headline, Phantom lavender #F5F2FF, 24-32px cards, 100px pill buttons, soft shadows.
  app: {
    id: "app", dark: false,
    bg: "#F6F4FF", surface: "#FFFFFF", text: "#17141F", muted: "#5E5872", border: "#E6E1F5",
    accent: "#7A5AF8", accentText: "#FFFFFF", radius: 28,
    fontDisplay: "'Bricolage Grotesque', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif", fontMono: "'Geist Mono', monospace",
    fontsHref: gf("family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "orbs", surface: "soft", motion: "bouncy", density: "airy", ticker: false, pill: true, transition: "stack", reveal: "rise", frame: "float", stats: "chips" },
  },
  // SPX6900: Space Mono, 0 radius, 5.6px hard offset shadows in #0A0A0A, a dot grid, highlighter yellow.
  brutal: {
    id: "brutal", dark: false,
    bg: "#F2F2EE", surface: "#FFFFFF", text: "#0A0A0A", muted: "#3F3F3F", border: "#0A0A0A",
    accent: "#E5FF1A", accentText: "#0A0A0A", radius: 0,
    fontDisplay: "'Barlow Condensed', sans-serif", fontBody: "'Space Mono', monospace", fontMono: "'Space Mono', monospace",
    fontsHref: gf("family=Barlow+Condensed:wght@700;800;900&family=Space+Mono:wght@400;700"),
    uppercase: true,
    fx: { bg: "dots", surface: "offset", motion: "snappy", density: "regular", ticker: true, pill: false, transition: "stack", reveal: "slide", progress: true, stats: "panel", titles: "number" },
  },
  // Uniswap's floating orbs, Raydium/Shib frosted panels (backdrop blur 12-25px, white at 3-8%), 20px radii.
  glass: {
    id: "glass", dark: true,
    bg: "#0A0B14", surface: "rgba(255,255,255,0.05)", text: "#F2F3FA", muted: "#9AA0B8", border: "rgba(255,255,255,0.10)",
    accent: "#FC72FF", accentText: "#14051A", radius: 20,
    fontDisplay: "'Sora', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif", fontMono: "'Geist Mono', monospace",
    fontsHref: gf("family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&family=Geist+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "orbs", surface: "glass", motion: "calm", density: "regular", ticker: false, pill: true, transition: "fade", reveal: "blur", progress: true, stats: "panel" },
  },
  // The five below come from a second study (2026-11-07, docs/ui-study.md): Agora, Alchemy, Infinex, Oak and
  // Musebook with hmmmm. Measured from the live pages; fonts are the nearest free match where theirs is licensed.
  // Agora: near-black, Inter 500/600 at 11-15px, 12-16px radii, a gradient banner card for the featured token,
  // small caps stat labels, pill filter chips, ranked lists. Professional, but every number is moving.
  launchpad: {
    id: "launchpad", dark: true,
    bg: "#09090B", surface: "#131418", text: "#F4F4F5", muted: "#9A9BA1", border: "#24252B",
    accent: "#3D7BFF", accentText: "#FFFFFF", radius: 14,
    fontDisplay: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif", fontMono: "'JetBrains Mono', monospace",
    fontsHref: gf("family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "none", surface: "soft", motion: "snappy", density: "compact", ticker: true, pill: true, transition: "none", reveal: "fade", stats: "cards", hover: "lift" },
  },
  // Alchemy: white, Neue Montreal at weight 400 for headlines (Inter Tight here), #020617 text, slate #64748B,
  // #E2E8F0 hairlines, #363FF9 blue, 8-16px radii, a lavender wash, a product screen beside the headline,
  // big light numbers in a divided strip, two-tone section titles.
  platform: {
    id: "platform", dark: false,
    bg: "#FFFFFF", surface: "#FFFFFF", text: "#020617", muted: "#64748B", border: "#E2E8F0",
    accent: "#363FF9", accentText: "#FFFFFF", radius: 12,
    fontDisplay: "'Inter Tight', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif", fontMono: "'IBM Plex Mono', monospace",
    fontsHref: gf("family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "wash", surface: "soft", motion: "calm", density: "airy", ticker: false, pill: false, transition: "none", reveal: "fade", stats: "strip", titles: "split" },
  },
  // Infinex: pure black, Inter 600, a two-line headline, #FE6F39 orange pill buttons, #101114/#1C1E21 surfaces,
  // 20-40px radii, a floating capsule nav, the app itself (phone and desktop) bleeding off the right edge.
  exchange: {
    id: "exchange", dark: true,
    bg: "#000000", surface: "#101114", text: "#ECEEF1", muted: "#B0B4BA", border: "#23252A",
    accent: "#FE6F39", accentText: "#0B0B0B", radius: 24,
    fontDisplay: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif", fontMono: "'Geist Mono', monospace",
    fontsHref: gf("family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "glow", surface: "soft", motion: "calm", density: "regular", ticker: false, pill: true, transition: "stack", reveal: "rise", frame: "float", stats: "cards" },
  },
  // Musebook and hmmmm: warm cream paper (#FFFDF8, #FBF3E4), a heavy serif display with the last word in
  // terracotta, small tracked eyebrows, pill counters, the art in a soft blob with a taped, tilted caption.
  storybook: {
    id: "storybook", dark: false,
    bg: "#FFFBF2", surface: "#FFFFFF", text: "#2B2B2B", muted: "#6B6256", border: "#EADFCB",
    accent: "#A55630", accentText: "#FFFFFF", radius: 18,
    fontDisplay: "'Fraunces', Georgia, serif", fontBody: "'Source Sans 3', system-ui, sans-serif", fontMono: "'JetBrains Mono', monospace",
    fontsHref: gf("family=Fraunces:opsz,wght@9..144,600;9..144,800;9..144,900&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "none", surface: "soft", motion: "bouncy", density: "airy", ticker: false, pill: true, transition: "wave", reveal: "rise", frame: "float", stats: "chips", titles: "eyebrow", hover: "lift" },
  },
  // Oak: deep forest #062F27, cream text, amber eyebrows with a rule, lime pill buttons, a serif for section
  // titles, a full-bleed illustrated hero with a chunky 3D title laid over its bottom-left corner.
  forest: {
    id: "forest", dark: true,
    bg: "#062F27", surface: "rgba(240,247,234,0.05)", text: "#F0F7EA", muted: "#C5D6C7", border: "rgba(240,247,234,0.14)",
    accent: "#C3F56B", accentText: "#062F27", radius: 14,
    fontDisplay: "'Source Serif 4', Georgia, serif", fontBody: "'Manrope', system-ui, sans-serif", fontMono: "'JetBrains Mono', monospace",
    fontsHref: gf("family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Manrope:wght@400;500;600;700&family=Rubik:wght@800;900&family=JetBrains+Mono:wght@400;500"),
    uppercase: false,
    fx: { bg: "none", surface: "outline", motion: "calm", density: "regular", ticker: false, pill: true, transition: "fade", reveal: "fade", frame: "float", stats: "strip", titles: "number" },
  },
};

/** Each style's own hero, so no two styles open on the same skeleton. */
export const HERO_OF: Record<ThemeId, { layout: HeroLayout; size: "md" | "lg" | "xl"; mock?: "phone" | "window" }> = {
  degen: { layout: "mascot", size: "xl" },
  clean: { layout: "split", size: "lg" },
  retro: { layout: "window", size: "lg" },
  cozy: { layout: "collage", size: "lg" },
  terminal: { layout: "dash", size: "md" },
  app: { layout: "center", size: "xl" },
  brutal: { layout: "stack", size: "xl" },
  glass: { layout: "center", size: "lg" },
  launchpad: { layout: "banner", size: "md" },
  platform: { layout: "product", size: "lg", mock: "window" },
  exchange: { layout: "product", size: "lg", mock: "phone" },
  storybook: { layout: "collage", size: "lg" },
  forest: { layout: "poster", size: "xl" },
};

export const THEME_LABELS: Record<ThemeId, string> = {
  degen: "Degen", clean: "Clean", retro: "Retro arcade", cozy: "Cozy",
  terminal: "Terminal", app: "Wallet app", brutal: "Brutalist", glass: "Glass DeFi",
  launchpad: "Launchpad", platform: "Platform", exchange: "Exchange", storybook: "Storybook", forest: "Forest",
};

/** One line on what each style is, for menus and the copywriter. */
export const THEME_NOTES: Record<ThemeId, string> = {
  degen: "loud meme site: all caps, slogan ticker, glow, floating mascot",
  clean: "calm and trustworthy, airy, soft cards",
  retro: "8-bit arcade, pixel type, grid floor",
  cozy: "soft, lowercase, warm, chunky outlines",
  terminal: "dark trading terminal like Axiom or pump.fun: dense, flat panels, live numbers first",
  app: "friendly wallet-app marketing like MetaMask or Phantom: huge headline, pill buttons, soft cards",
  brutal: "internet-native brutalism like SPX6900: mono type, hard offset shadows, dot grid",
  glass: "glassy DeFi like Uniswap or Raydium: frosted panels, floating colour orbs",
  launchpad: "professional launchpad like Agora: dark, a featured-token banner, small caps stats, every number live",
  platform: "corporate DeFi infrastructure like Alchemy: white, light headlines, a product screen, big numbers in a strip",
  exchange: "sleek exchange app like Infinex: pure black, orange pill buttons, a floating nav, the app on a phone",
  storybook: "warm storybook meme like Musebook or hmmmm: cream paper, a serif headline, tilted stickers, pill counters",
  forest: "illustrated meme-ish like Oak: deep forest green, serif titles, a big poster hero with a chunky 3D title",
};

/** The style's effects, for specs saved before effects existed. */
export function fxOf(t: Theme): ThemeFx {
  const own = THEMES[t.id]?.fx ?? THEMES.degen.fx!;
  return t.fx ? { ...own, ...t.fx } : own;
}

// Words that name a look win over words that only say what the project is ("a loud site for a trading bot" is degen).
const LOOKS: Array<[ThemeId, RegExp]> = [
  ["launchpad", /\b(launchpad|launch ?pad|fomo(ish)?|discovery|trending)\b/i],
  ["platform", /\b(corporate|enterprise|infrastructure|b2b|saas|institutional)\b/i],
  ["exchange", /\b(exchange|neobank|sleek dark|all black|pure black)\b/i],
  ["storybook", /\b(storybook|scrapbook|paper|cream|serif|editorial|whimsical|overthink(ing|ers)?)\b/i],
  ["forest", /\b(forest|woods?|nature|illustrated|diorama|oak|trees?)\b/i],
  ["terminal", /\b(terminal|bloomberg|dense)\b/i],
  ["app", /\b(wallet[- ]app|app[- ]like|friendly|consumer)\b/i],
  ["brutal", /\b(brutal(ist|ism)?|raw|zine|newspaper|monospace|internet[- ]native|anti[- ]design)\b/i],
  ["glass", /\b(glass(y|morphism)?|frosted|gradients?|futuristic|sleek|premium|luxury)\b/i],
  ["retro", /\b(retro|pixel|arcade|8.?bit|16.?bit|crt|vaporwave)\b/i],
  ["cozy", /\b(cozy|cosy|cute|soft|wholesome|kawaii|pastel|chill)\b/i],
  ["clean", /\b(clean|minimal|professional|serious|elegant)\b/i],
  ["degen", /\b(degen|loud|chaos|chaotic|bold)\b/i],
];
const TOPICS: Array<[ThemeId, RegExp]> = [
  ["terminal", /\b(trading|trader|perps?|dashboard|sniper|analytics)\b/i],
  ["app", /\b(wallet|fintech|payments?|app)\b/i],
  ["glass", /\b(defi|dex|swaps?|yield|liquidity|bridge|protocol)\b/i],
  ["retro", /\b(game|gaming)\b/i],
  ["cozy", /\b(frog|bunny)\b/i],
  ["clean", /\b(treasury|dao|community|grants?)\b/i],
  ["degen", /\b(ape|pump|moon|dog|cat|wif|bonk|send)\b/i],
];

// "Like Axiom", "pump.fun vibes": a named product picks the style it belongs to and lends its signature colour.
// The team's own brand colour still wins over the lent one.
export const REFERENCES: Array<{ name: string; re: RegExp; theme: ThemeId; accent: string | null }> = [
  { name: "Axiom", re: /\baxiom\b/i, theme: "terminal", accent: "#5B7CFF" },
  { name: "pump.fun", re: /\bpump\.?fun\b/i, theme: "terminal", accent: "#86EFAC" },
  { name: "GMGN", re: /\bgmgn\b/i, theme: "terminal", accent: "#A3E635" },
  { name: "Photon", re: /\bphoton\b/i, theme: "terminal", accent: "#8B7CFF" },
  { name: "Hyperliquid", re: /\bhyperliquid\b/i, theme: "clean", accent: "#0F7A68" },
  { name: "MetaMask", re: /\bmeta ?mask\b/i, theme: "app", accent: "#FF5C16" },
  { name: "Phantom", re: /\bphantom\b/i, theme: "app", accent: "#6E56CF" },
  { name: "Rainbow", re: /\brainbow (wallet|app)\b/i, theme: "app", accent: "#1F7AFF" },
  { name: "Uniswap", re: /\buniswap\b/i, theme: "glass", accent: "#FC72FF" },
  { name: "Raydium", re: /\braydium\b/i, theme: "glass", accent: "#22D1F8" },
  { name: "Jupiter", re: /\bjup(iter)?\b/i, theme: "glass", accent: "#C7F284" },
  { name: "SPX6900", re: /\bspx(6900)?\b/i, theme: "brutal", accent: "#E5FF1A" },
  { name: "Agora", re: /\bagora(dex)?\b/i, theme: "launchpad", accent: "#3D7BFF" },
  { name: "Alchemy", re: /\balchemy\b/i, theme: "platform", accent: "#363FF9" },
  { name: "Infinex", re: /\binfinex\b/i, theme: "exchange", accent: "#FE6F39" },
  { name: "Musebook", re: /\bmusebook\b/i, theme: "storybook", accent: "#A55630" },
  { name: "hmmmm", re: /\bhm{3,}(\.fun)?\b/i, theme: "storybook", accent: "#3BB54A" },
  { name: "Oak", re: /\boak ?(agent ?kit)?\b/i, theme: "forest", accent: "#C3F56B" },
];

/** A product the words point to as a look ("like Axiom", "Uniswap style"), or null. */
export function referenceIn(text: string): (typeof REFERENCES)[number] | null {
  return REFERENCES.find((r) => r.re.test(text)) ?? null;
}

/** The words with style references taken out, so "like pump.fun" doesn't also pick Solana. */
export function withoutReferences(text: string): string {
  let out = text;
  for (const r of REFERENCES) out = out.replace(new RegExp(`\\b(like|as|à la|inspired by|in the style of|style of|vibe of)\\s+${r.re.source.replace(/^\\b|\\b$/g, "")}\\b`, "gi"), " ").replace(new RegExp(`${r.re.source}[- ]?(style|vibes?|look|feel|like)\\b`, "gi"), " ");
  return out;
}

/** The style the words ask for, or null when they don't name one. */
export function themeNamed(text: string): ThemeId | null {
  const ref = referenceIn(text);
  if (ref) return ref.theme;
  for (const [id, re] of LOOKS) if (re.test(text)) return id;
  for (const [id, re] of TOPICS) if (re.test(text)) return id;
  return null;
}

export function themeFromText(text: string): ThemeId {
  return themeNamed(text) ?? "degen";
}

const NAMED_COLORS: Record<string, string> = {
  red: "#FF4D4D", orange: "#FF8A3D", yellow: "#FFE600", gold: "#F5C542", green: "#22C55E", lime: "#C6F24E",
  teal: "#14B8A6", cyan: "#3CF0FF", blue: "#3B82F6", purple: "#8B5CF6", violet: "#8B5CF6", pink: "#FF4FD8", white: "#FFFFFF",
};

export function colorFromText(text: string): string | null {
  const hex = text.match(/#[0-9a-fA-F]{6}\b/);
  if (hex) return hex[0];
  for (const [name, c] of Object.entries(NAMED_COLORS)) if (new RegExp(`\\b${name}\\b`, "i").test(text)) return c;
  return null;
}

/** Text colour that stays readable on a given accent. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? "#0B0B0B" : "#FFFFFF";
}

/** A brand colour nudged so it still reads on the theme's background: brighter on dark pages, deeper on light ones. */
export function fitAccent(hex: string, dark: boolean): string {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const want = dark ? Math.max(mx, 0.72) : Math.min(mx, 0.62);
  if (mx > 0 && want !== mx) { const k = want / mx; r *= k; g *= k; b *= k; }
  return "#" + [r, g, b].map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The new style's tokens, keeping a colour the team chose or got from their brand. */
export function restyle(cur: Theme, id: ThemeId, words = "", color: string | null = null): Theme {
  const base = THEMES[id];
  const ref = referenceIn(words);
  const own = cur.accent !== THEMES[cur.id]?.accent;
  const accent = color ?? (own ? fitAccent(cur.accent, base.dark) : ref?.theme === id && ref.accent ? ref.accent : base.accent);
  return { ...base, accent, accentText: accent === base.accent ? base.accentText : readableOn(accent) };
}

/** On a change of style the hero takes the new style's composition, so a restyle changes the page's shape too. */
export function withHeroOf<T extends { type: string; props: Record<string, unknown> }>(blocks: T[], id: ThemeId): T[] {
  const h = HERO_OF[id];
  return blocks.map((b) => (b.type === "hero" ? { ...b, props: { ...b.props, layout: h.layout, size: h.size, ...(h.mock ? { mock: h.mock } : {}) } } : b));
}
