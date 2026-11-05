// The site is data, not code: the agent writes a SiteSpec and src/blocks renders it.
// Every block keeps a stable id so a comment on the preview maps to exactly one block.

export type Chain = "near" | "solana" | "ethereum" | "base" | "bsc" | "robinhood";

export const CHAIN_IDS = ["near", "solana", "ethereum", "base", "bsc", "robinhood"] as const satisfies readonly Chain[];
export const isEvm = (c: Chain) => c === "ethereum" || c === "base" || c === "bsc" || c === "robinhood";

export const CHAINS: Record<Chain, { name: string; short: string; native: string; explorer: string }> = {
  near: { name: "NEAR", short: "NEAR", native: "NEAR", explorer: "https://nearblocks.io/token/" },
  solana: { name: "Solana", short: "SOL", native: "SOL", explorer: "https://solscan.io/token/" },
  ethereum: { name: "Ethereum", short: "ETH", native: "ETH", explorer: "https://etherscan.io/token/" },
  base: { name: "Base", short: "Base", native: "ETH", explorer: "https://basescan.org/token/" },
  bsc: { name: "BNB Chain", short: "BNB", native: "BNB", explorer: "https://bscscan.com/token/" },
  robinhood: { name: "Robinhood Chain", short: "Robinhood", native: "ETH", explorer: "https://robinhoodchain.blockscout.com/token/" },
};

export const THEME_IDS = ["degen", "clean", "retro", "cozy", "terminal", "app", "brutal", "glass"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/**
 * How a style moves and sits on the page, beyond its colours and fonts. Taken from a study of live dApp and
 * memecoin sites (2026-10-26): trading terminals run dense with flat outlined panels and quick motion; wallet
 * apps run airy with soft cards, pill buttons and bouncy motion; meme sites run a slogan ticker and a glow.
 */
export interface ThemeFx {
  /** Behind the hero: nothing, a line grid, a dot grid, an accent glow, soft floating orbs, or diagonal stripes. */
  bg: "none" | "grid" | "dots" | "glow" | "orbs" | "stripes";
  /** Cards and buttons: hairline outline, soft shadow, frosted glass, or a hard offset shadow. */
  surface: "outline" | "soft" | "glass" | "offset";
  motion: "snappy" | "calm" | "bouncy";
  density: "compact" | "regular" | "airy";
  /** A scrolling slogan strip under the navigation. */
  ticker: boolean;
  /** Pill-shaped buttons whatever the card radius. */
  pill: boolean;
  /** How sections come in as they scroll into view (missing: rise). Read off a reference site when one is given. */
  reveal?: "rise" | "fade" | "scale" | "blur" | "slide" | "none";
  /** What cards and buttons do under the cursor (missing: the surface's own). */
  hover?: "lift" | "scale" | "glow" | "none";
  /** The hero's art drifts slower than the page as it scrolls. */
  parallax?: boolean;
  /** How one section crosses into the next: nothing, a colour blend, overlapping rounded sheets, a wave or a slanted seam (missing: the style's own). */
  transition?: "none" | "fade" | "stack" | "wave" | "angle";
  /** Grid children (cards, steps, stats) come in one after another rather than together (missing: on). */
  stagger?: boolean;
  /** The hero's kicker, headline, subhead and buttons come in as a sequence on first load (missing: on). */
  intro?: boolean;
  /** "compact": the nav blurs, tightens and gains a shadow once the page scrolls (missing: compact). */
  nav?: "plain" | "compact";
  /** A thin accent bar at the top that fills as the page scrolls (missing: off). */
  progress?: boolean;
  /** Stat numbers count up when they scroll into view (missing: on). */
  count?: boolean;
  /** A back-to-top button on long pages (missing: on). */
  toTop?: boolean;
}

export interface Theme {
  id: ThemeId;
  dark: boolean;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  radius: number;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  fontsHref: string;
  uppercase: boolean;
  /** Missing on sites built before styles had effects: the style's own defaults apply. */
  fx?: ThemeFx;
}

export interface TokenLink { type: string; label: string; url: string }

export interface TokenInfo {
  chain: Chain;
  address: string;
  name: string;
  symbol: string;
  decimals: number | null;
  logo: string | null;
  header: string | null;
  description: string | null;
  links: TokenLink[];
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  change24h: number | null;
  holders: number | null;
  supply: number | null;
  pairAddress: string | null;
  pairUrl: string | null;
  dexId: string | null;
  /** Where each figure came from, shown to the builder so nothing looks invented. */
  sources: string[];
  /** Where it launched and trades (lib/venues.ts). Missing on sites built before venues were read. */
  venue?: TokenVenue;
  /** A made-up token for the style showcase: numbers move on their own and nothing is fetched. */
  demo?: boolean;
}

/** A token's launchpad and pool, as venue ids from lib/venues.ts. */
export interface TokenVenue {
  launchpad: string | null;
  dex: string | null;
  /** curve: still on the launchpad's bonding curve; graduated: moved to a pool; pool: launched straight into one. */
  stage: "curve" | "graduated" | "pool" | null;
  /** Share of the curve already bought (0–1), where the launchpad shows it on chain. */
  progress: number | null;
  /** The launchpad's own page, where a buy goes while our router can't reach the curve. */
  buyUrl: string | null;
}

export type BlockType =
  | "nav" | "hero" | "stats" | "buy" | "chart" | "trades" | "how"
  | "tokenomics" | "holders" | "roadmap" | "treasury" | "socials" | "faq" | "footer" | "story" | "posts";

export const BLOCK_LABELS: Record<BlockType, string> = {
  nav: "Navigation", hero: "Hero", stats: "Live stats", buy: "Buy box", chart: "Chart",
  trades: "Live trades", how: "How to buy", tokenomics: "Tokenomics", holders: "Holders",
  roadmap: "Roadmap", treasury: "Treasury", socials: "Socials", faq: "FAQ", footer: "Footer",
  story: "Story", posts: "From X",
};

export interface Block {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
}

export interface Integrations {
  walletconnectProjectId?: string;
  privyAppId?: string;
  heliusKeyOnServer?: boolean;
  /** Paid RPC URLs never reach a published page: reads go through /api/rpc. */
  rpcUrl?: string;
}

export interface SiteSpec {
  name: string;
  ticker: string;
  tagline: string;
  chain: Chain;
  theme: Theme;
  token: TokenInfo | null;
  blocks: Block[];
  /** Socials and website for the whole site, found by research or given by the team. Wins over token.links. */
  links?: TokenLink[];
  /** The team's X account and a few recent posts, snapshotted at build time. */
  x?: { profile: XProfile; posts: XPost[] } | null;
  /** A logo the team uploaded; wins over the token's and the X picture. */
  logo?: string | null;
}

/** An image the team uploaded in the builder: re-encoded in the browser, checked and stored by us (/api/assets). */
export interface Asset { id: string; url: string; name: string; w: number; h: number; bytes: number; at: number }

/** What a reference site was read as (lib/reference.ts): its look and motion, never its words or pictures. */
export interface RefRead {
  url: string;
  host: string;
  /** "browser" read it rendered (scroll, hover, motion seen); "html" only read its markup and CSS. */
  how: "browser" | "html";
  title: string | null;
  pages: Array<{ url: string; title: string | null; sections: RefSection[] }>;
  palette: { bg: string | null; surface: string | null; text: string | null; muted: string | null; accent: string | null; dark: boolean | null };
  fonts: { display: string | null; body: string | null; google: string[] };
  uppercase: boolean;
  radius: number | null;
  surface: "outline" | "soft" | "glass" | "offset" | null;
  motion: { reveal: NonNullable<ThemeFx["reveal"]> | null; hover: NonNullable<ThemeFx["hover"]> | null; speed: "snappy" | "calm" | "bouncy" | null; parallax: boolean; marquee: boolean; smoothScroll: boolean; sticky: boolean; libraries: string[] };
  /** Plain-words notes for the builder's chat and the writer ("dark comic look, big condensed display type"). */
  notes: string[];
  at: number;
}

/** One section of a reference page, as structure only: what kind it reads as, its layout, and what it holds. */
export interface RefSection { kind: string; cols: number; media: boolean; buttons: number; heightPx: number }

export interface XProfile { handle: string; name: string; bio: string; followers: number | null; avatar: string | null; banner: string | null }
export interface XPost { id: string; text: string; at: number; likes: number; reposts: number; url: string; image: string | null }

/** How the team writes on X, measured from their own posts. */
export interface Voice {
  caps: number;
  lowercase: number;
  exclaim: number;
  emojis: string[];
  signature: string | null;
  tags: string[];
  words: string[];
  avgLen: number;
  notes: string[];
}

export interface Finding { type: string; label: string; url: string; source: string }

/** Socials the team typed on the landing page. */
export interface SocialInput { x?: string; telegram?: string; website?: string; discord?: string }

/** Everything the build learned about the project before writing a word. */
export interface Research {
  links: Finding[];
  missing: Array<"x" | "telegram" | "website">;
  descriptions: Array<{ text: string; source: string }>;
  website: { url: string; title: string | null; description: string | null; image: string | null; excerpt: string | null; themeColor?: string | null } | null;
  x: { profile: XProfile; posts: XPost[]; voice: Voice; via: string } | null;
  lore: string | null;
  utility: string[];
  meme: boolean;
  /** The project's own colour: its website's theme-color, else the logo's dominant colour. */
  brand: { color: string; from: "website" | "logo" } | null;
  sources: string[];
}

export type StepState = "pending" | "running" | "done" | "skipped" | "error";

export interface BuildStep {
  id: string;
  title: string;
  detail: string;
  state: StepState;
  at: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  at: number;
  /** Which model answered, or "offline" for the rule-based fallback. */
  via?: string;
  /** Images sent with the message (Asset urls). */
  assets?: string[];
}

export interface PendingComment {
  id: string;
  blockId: string;
  blockLabel: string;
  element?: string;
  text: string;
  /** Images sent with the comment (Asset ids). */
  assets?: string[];
}

export interface Project {
  id: string;
  slug: string;
  /** Display name set by a rename; the site's own name stays spec.name. */
  name?: string;
  /** The account that owns it. Missing on anonymous and pre-account projects. */
  ownerId?: string;
  /** SHA-256 of the anonymous browser id that made it, until someone signs in on that browser. */
  anon?: string;
  /** The team workspace it lives in, if any; its members get their role's access. */
  teamId?: string;
  prompt: string;
  kind: "memecoin" | "dapp" | "nft";
  /** Style picked on the landing page; wins over the one read from the sentence. */
  style?: ThemeId;
  socials?: SocialInput;
  research?: Research;
  /** Reference sites the team gave ("ref: https://…"), as read. */
  refs?: RefRead[];
  /** Images uploaded in the builder. */
  assets?: Asset[];
  createdAt: number;
  updatedAt: number;
  status: "building" | "ready" | "error";
  steps: BuildStep[];
  messages: ChatMessage[];
  spec: SiteSpec | null;
  history: SiteSpec[];
  network: { chain: Chain; rpcUrl?: string };
  integrations: Integrations;
  published: { slug: string; at: number } | null;
  /** The spec as of the last publish; edits stay in the builder until the next one. */
  publishedSpec?: SiteSpec;
  /** Who may open the published site (Pro). Missing is public. Link and password also keep the builder owner-only. */
  access?: SiteAccess;
  /** A custom domain for the published site (Pro), one per project. */
  domain?: CustomDomain;
  version: number;
}

export interface SiteAccess {
  mode: "public" | "link" | "password";
  /** Private link: the secret in ?k=. */
  key?: string;
  /** Password: scrypt, "s1$salt$hash". */
  pass?: string;
  at: number;
}

export type DomainStatus = "pending" | "verified" | "live";
export interface CustomDomain {
  /** Lowercase ASCII (punycode). */
  host: string;
  /** Value of the TXT record at _sitesmith.<host> that proves the domain is theirs. */
  token: string;
  status: DomainStatus;
  apex: boolean;
  at: number;
  checkedAt?: number;
  /** Cloudflare for SaaS custom hostname, when the API is set up. */
  cf?: { id: string; status: string; ssl: string; txt?: { name: string; value: string }; error?: string };
}

/** What the project is called in lists and the builder: a rename wins over the site's own name. */
export const displayName = (p: Pick<Project, "name" | "spec">) => p.name || p.spec?.name || "New site";

export function newId(len = 10): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) s += abc[b % abc.length];
  return s;
}
