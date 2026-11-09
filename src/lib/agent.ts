import { z } from "zod";
import { askJson, llmAvailable } from "./llm";
import { tokenContext } from "./chain";
import { readToken, venue, venueBrief, venueLine, venuesNamed, withoutVenueMentions } from "./venues";
import { moreChains, readIntent, type Intent } from "./intent";
import { research } from "./research";
import { readReference } from "./reference";
import { withoutRefs as withoutRefsText } from "./reference-urls";
import { orderLike, refBlockOrder, refLine, themeFromRef, themeForRef } from "./ref-style";
import { nudgeTheme, pickStyleRefs, themeOfPicks, type StyleRef } from "./style-library";
import { HERO_OF, THEMES, THEME_LABELS, THEME_NOTES, colorFromText, withHeroOf, fitAccent, fxOf, readableOn, referenceIn, restyle, themeNamed } from "./themes";
import { getProject, updateProject } from "./store";
import { paletteOf } from "./palette";
import { direct, imagesOf, remember, themeOfBrief, understand, type DesignInput } from "./design/brief";
import { writeSite } from "./design/codegen";
import { editCode } from "./design/edit";
import { inspect, reviewRequest, staticPage } from "./design/review";
import { fontPair } from "./design/fonts";
import { etaPlan, recordBuild, type BuildMode } from "./build-times";
import { readTreasury, treasuryAccountsIn, validAccount, type TreasuryData } from "./treasury";
import { BLOCK_LABELS, CHAINS, THEME_IDS, newId, type Asset, type Block, type BlockType, type Chain, type PendingComment, type Project, type RefRead, type BuildBoard, type Research, type SiteSpec, type Dossier, type DesignBrief, type ThemeFx, type Theme, type ThemeId, type TokenInfo, type TokenLink } from "./spec";

// The build pipeline: prompt → intent → chain data → style → copy → blocks.
// Each step is written to the project as it runs so the builder can animate it.

const MIN_STEP_MS = 420;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type StepOut = string | null | { skipped: string };

async function step(id: string, stepId: string, title: string, run: () => Promise<StepOut>): Promise<void> {
  const started = Date.now();
  await updateProject(id, (p) => {
    p.steps.push({ id: stepId, title, detail: "", state: "running", at: started, began: started });
  });
  let detail: string | null = null;
  let state: "done" | "skipped" | "error" = "done";
  try {
    const out = await run();
    if (out === null) state = "skipped";
    else if (typeof out === "object") { state = "skipped"; detail = out.skipped; }
    else detail = out;
  } catch (e) {
    state = "error";
    detail = e instanceof Error ? e.message : "failed";
  }
  const left = MIN_STEP_MS - (Date.now() - started);
  if (left > 0) await sleep(left);
  await updateProject(id, (p) => {
    const s = p.steps.find((x) => x.id === stepId);
    if (s) { s.state = state; s.detail = detail ?? "Skipped"; s.at = Date.now(); }
  });
}

/** A step of the standard block site while a designed site is the goal: it runs quietly as the fallback, unshown. */
async function quiet(_id: string, stepId: string, _title: string, run: () => Promise<StepOut>): Promise<void> {
  try { await run(); } catch (e) { console.warn(`[build] fallback ${stepId}: ${e instanceof Error ? e.message : "failed"}`); }
}

/** Adds what the build just found or decided to the builder's board. */
function onBoard(id: string, part: BuildBoard): Promise<unknown> {
  return updateProject(id, (p) => { p.board = { ...(p.board ?? {}), ...part }; }).catch(() => null);
}

// ---------- copy ----------

interface Copy {
  name: string;
  ticker: string;
  tagline: string;
  headline: string;
  subhead: string;
  cta: string;
  how: { title: string; body: string }[];
  faq: { q: string; a: string }[];
  roadmap: { when: string; title: string; body: string }[];
  story: { title: string; body: string; points: string[] } | null;
}

const CopySchema = z.object({
  name: z.string().min(1).max(40),
  ticker: z.string().min(1).max(12),
  tagline: z.string().min(1).max(120),
  theme: z.enum(THEME_IDS).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  headline: z.string().min(1).max(80),
  subhead: z.string().min(1).max(240),
  cta: z.string().min(1).max(24),
  how: z.array(z.object({ title: z.string().max(40), body: z.string().max(200) })).min(3).max(4),
  faq: z.array(z.object({ q: z.string().max(120), a: z.string().max(400) })).min(2).max(5),
  roadmap: z.array(z.object({ when: z.string().max(16), title: z.string().max(48), body: z.string().max(160) })).min(2).max(4),
  story: z.object({ title: z.string().max(40), body: z.string().max(700), points: z.array(z.string().max(180)).max(4) }).nullable().optional(),
  fx: z.object({
    motion: z.enum(["snappy", "calm", "bouncy"]), reveal: z.enum(["rise", "fade", "scale", "blur", "slide", "none"]), transition: z.enum(["none", "fade", "stack", "wave", "angle"]),
    stagger: z.boolean(), intro: z.boolean(), nav: z.enum(["plain", "compact"]), progress: z.boolean(), count: z.boolean(), toTop: z.boolean(), parallax: z.boolean(),
  }).partial().optional(),
});

const SCROLL_KEYS = ["transition", "stagger", "intro", "nav", "progress", "count", "toTop"] as const;
const MOTION_KEYS = ["motion", "reveal", "parallax", ...SCROLL_KEYS] as const;

/**
 * How the page moves, decided per site: the style's defaults, then the writer's pick for the vibe, then words in the
 * prompt ("minimal", "no animations", "add a progress bar"). A reference site's own motion (reveal, hover, speed) is kept.
 */
export function autoFx(theme: Theme, pick: Partial<ThemeFx> | undefined, prompt: string, ref: boolean): ThemeFx {
  const cur = fxOf(theme);
  const out: ThemeFx = { ...cur };
  const o = out as unknown as Record<string, unknown>;
  for (const k of ref ? SCROLL_KEYS : MOTION_KEYS) if (pick?.[k] !== undefined) o[k] = pick[k];
  const said = fxEdit(prompt, out);
  if (said) for (const k of MOTION_KEYS) if (said[k] !== out[k]) o[k] = said[k];
  return out;
}

/** Where the token trades, in words a buyer follows: its launchpad and pool when we know them. */
function tradesAt(token: TokenInfo | null, chainName: string): string {
  const tv = token?.venue;
  const pad = venue(tv?.launchpad);
  const dex = venue(tv?.dex)?.name ?? (token?.dexId ? venueLine({ dexId: token.dexId })?.replace(/^Trades on /, "") : null);
  if (pad && tv?.stage === "curve") return `It launched on ${pad.name} and still trades on its bonding curve${pad.graduatesTo ? `; when the curve fills it graduates to ${venue(pad.graduatesTo)?.name}` : ""}. ${pad.routable === false ? `The buy box sends you to ${pad.name} until then.` : "The buy box on this page buys straight from the curve."}`;
  if (pad && tv?.stage === "graduated") return `It launched on ${pad.name} and has graduated to ${dex ?? "a DEX pool"} on ${chainName}. The buy box on this page routes your order there.`;
  if (pad) return `It launched on ${pad.name}${dex ? ` and trades on ${dex}` : ""} on ${chainName}. The buy box on this page routes your order there.`;
  return dex ? `On ${dex} on ${chainName}. The buy box on this page routes your order there.` : `On ${chainName}. The buy box on this page finds the best route.`;
}

/** A still-on-the-curve token gets one question about the curve. */
function curveFaq(token: TokenInfo | null, ticker: string): Copy["faq"] {
  const tv = token?.venue;
  const pad = venue(tv?.launchpad);
  if (!pad || tv?.stage !== "curve") return [];
  const how = pad.how.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
  return [{ q: "What's the bonding curve?", a: `${how}${tv.progress != null ? ` $${ticker}'s curve is ${Math.round(tv.progress * 100)}% sold.` : ""}`.slice(0, 400) }];
}

function walletWord(chain: Chain): string {
  return chain === "solana" ? "Phantom, Solflare or Backpack" : chain === "near" ? "HOT, Meteor or Intear" : "MetaMask, Rabby or any WalletConnect wallet";
}

function firstLine(t: string | null | undefined, max: number): string | null {
  const s = (t ?? "").replace(/https?:\/\/\S+/g, "").split(/\n+/).map((x) => x.trim()).find((x) => x.length > 8);
  if (!s) return null;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,;:\s]+$/, "")}…`;
}

/** Say it the way they say it: capitals, lowercase, their sign-off. */
function inVoice(text: string, r: Research | null): string {
  const v = r?.x?.voice;
  if (!v) return text;
  let out = text;
  if (v.caps > 0.5) out = out.toUpperCase();
  else if (v.lowercase > 0.6) out = out.toLowerCase();
  if (v.signature && !out.endsWith(v.signature)) out = `${out} ${v.signature}`;
  return out;
}

/** Without a style named, the team's own voice picks one. */
export function themeFromResearch(r: Research | null): ThemeId | null {
  const v = r?.x?.voice;
  if (v && v.caps > 0.5) return "degen";
  if (v && v.lowercase > 0.6) return "cozy";
  if (r && !r.meme && r.utility.length) {
    // What the project does picks the look its users already know: a trading tool reads like a terminal, a
    // protocol like DeFi, a wallet like a wallet app.
    const u = r.utility.join(" ");
    if (/\b(trading|terminal|sniper|bot|perps?|copy[- ]?trad)/i.test(u)) return "terminal";
    if (/\b(wallet|payments?|app)\b/i.test(u)) return "app";
    if (/\b(swaps?|yield|liquidity|protocol|bridge|staking|stake|dex|vaults?)\b/i.test(u)) return "glass";
    return "clean";
  }
  return null;
}

function offlineStory(r: Research | null, theme: ThemeId): Copy["story"] {
  if (!r?.lore && !r?.utility.length) return null;
  const title = theme === "retro" ? "Lore" : theme === "cozy" ? "our story" : r.meme ? "The lore" : "What it is";
  return { title, body: r.lore ?? "", points: r.meme ? [] : r.utility.slice(0, 3) };
}

function offlineCopy(intent: Intent, token: TokenInfo | null, chain: Chain, r: Research | null = null): Copy {
  const ticker = (token?.symbol || intent.ticker || intent.name || "TOKEN").toUpperCase().slice(0, 12);
  const name = token?.name || intent.name || ticker;
  const native = CHAINS[chain].native;
  const chainName = CHAINS[chain].name;
  const lines: Record<ThemeId, { headline: string; subhead: string; cta: string; tagline: string }> = {
    degen: { headline: `${ticker} to the top`, subhead: `${name} on ${chainName}. No roadmap theatre, no promises. Just the chart and the people holding it.`, cta: `Buy $${ticker}`, tagline: `The ${chainName} coin that doesn't sit still.` },
    clean: { headline: `${name}, built in the open`, subhead: `A community token on ${chainName}. Every number on this page is read from the chain when you open it.`, cta: `Buy ${ticker}`, tagline: `A community token on ${chainName}.` },
    retro: { headline: `Insert coin: ${ticker}`, subhead: `An 8-bit coin on ${chainName}. Collect it, hold it, climb the high-score table.`, cta: "Insert coin", tagline: `Player one has entered ${chainName}.` },
    cozy: { headline: `the ${name.toLowerCase()} corner of ${chainName}`, subhead: `sit down, stay a while. $${ticker} is a small coin with a big blanket.`, cta: `Get $${ticker}`, tagline: `a cozy coin on ${chainName}.` },
    terminal: { headline: `$${ticker}, live on ${chainName}`, subhead: `Price, liquidity and every trade, read from the chain as it happens. Buy from this page in two clicks.`, cta: `Trade $${ticker}`, tagline: `${name} on ${chainName}, live.` },
    app: { headline: `Meet ${name}`, subhead: `${name} lives on ${chainName}. Connect a wallet, pick an amount, done. No exchange account needed.`, cta: `Get $${ticker}`, tagline: `${name} on ${chainName}.` },
    brutal: { headline: `${ticker}. No noise.`, subhead: `A coin on ${chainName}. The chart is the chart. The contract is the contract. Both are below.`, cta: `Buy $${ticker}`, tagline: `${ticker} on ${chainName}. That's it.` },
    glass: { headline: `${name} on ${chainName}`, subhead: `Swap into $${ticker} from other chains, with price and liquidity read live from ${chainName}.`, cta: `Swap to ${ticker}`, tagline: `${name}, on ${chainName}.` },
    launchpad: { headline: `${name} is live`, subhead: `$${ticker} trades on ${chainName} right now. Market cap, volume and every buy are on this page, read from the chain.`, cta: `Buy $${ticker}`, tagline: `${name}, trending on ${chainName}.` },
    platform: { headline: `The ${chainName} token for ${name}`, subhead: `$${ticker} is ${name}'s token on ${chainName}. Live supply, price and liquidity below, and a buy box that takes coins from 13 chains.`, cta: `Get $${ticker}`, tagline: `${name} on ${chainName}.` },
    exchange: { headline: `Hold ${ticker}. Trade anywhere.`, subhead: `Buy $${ticker} on ${chainName} from the wallet you already have, or pay from another chain through NEAR Intents.`, cta: `Get $${ticker}`, tagline: `${name}, on ${chainName}.` },
    storybook: { headline: `A small coin with a big story`, subhead: `$${ticker} lives on ${chainName}. Read how it started, see who's holding, and pick some up if it makes you smile.`, cta: `Join $${ticker}`, tagline: `a little ${chainName} story.` },
    forest: { headline: `${name} grows here`, subhead: `$${ticker} is rooted on ${chainName}. The price, the holders and the buy box are all below.`, cta: `Get $${ticker}`, tagline: `${name}, rooted on ${chainName}.` },
  };
  const l = { ...lines[intent.theme] };
  // Their own words beat ours: the bio or site line for the tagline, the story for the subhead.
  const bio = firstLine(r?.x?.profile.bio, 110) ?? firstLine(r?.website?.title, 110) ?? firstLine(r?.website?.description, 110);
  if (bio) l.tagline = bio;
  // The story block tells the lore in full; the hero gets its first sentence, or their bio.
  const opener = r?.lore?.split(/(?<=[.!?])\s+/)[0];
  const sub = firstLine(r?.x?.profile.bio, 200) ?? (opener && opener.length <= 200 ? opener : null);
  if (sub && sub !== r?.lore) l.subhead = sub;
  l.headline = inVoice(l.headline, r);
  return {
    name, ticker, ...l,
    story: offlineStory(r, intent.theme),
    how: [
      { title: "Get a wallet", body: `${walletWord(chain)}. Any ${chainName} wallet works.` },
      { title: `Get ${native}, or don't`, body: `Holding something on another chain? The buy box takes SOL, ETH, BTC or USDC and swaps it through NEAR Intents.` },
      { title: `Buy $${ticker}`, body: "Type an amount in the buy box, check the quote and confirm in your wallet." },
    ],
    faq: [
      { q: `Where does $${ticker} trade?`, a: tradesAt(token, chainName) },
      ...curveFaq(token, ticker),
      { q: `Can I buy without ${native}?`, a: "Yes. In the buy box, pick the coin you hold under \"Pay with\": ETH, USDC, SOL, BTC and more. It arrives in your wallet as the token." },
      { q: "Where do the numbers come from?", a: `Price, market cap and holders are read live${token?.sources.length ? ` from ${token.sources.join(", ")}` : " from the chain"} each time the page opens.` },
    ],
    roadmap: [
      { when: "Done", title: "Launch", body: `Live on ${chainName}.` },
      { when: "Now", title: "[YOUR NEXT GOAL]", body: "Replace with what the community is working on." },
      { when: "Next", title: "[LATER GOAL]", body: "Replace with what comes after." },
    ],
  };
}

/** The venue facts the writer gets: the token's own launchpad and pool, else the ones the request names. */
function venueFor(token: TokenInfo | null, prompt: string) {
  const tv = token?.venue;
  const named = tv?.launchpad || tv?.dex ? [] : venuesNamed(prompt).slice(0, 2);
  const how = venueBrief(tv, named);
  if (!how) return null;
  const pad = venue(tv?.launchpad);
  return {
    launchpad: pad?.name ?? null, dex: venue(tv?.dex)?.name ?? null, stage: tv?.stage ?? null,
    curveSold: tv?.progress != null ? `${Math.round(tv.progress * 100)}%` : null,
    buyOnLaunchpad: tv?.stage === "curve" && pad?.routable === false ? pad.name : null,
    how,
  };
}

async function writeCopy(prompt: string, intent: Intent, token: TokenInfo | null, chain: Chain, r: Research | null, refs: RefRead[] = [], backup = false): Promise<{ copy: Copy; via: string; theme: ThemeId; accent: string | null; fx?: Partial<ThemeFx> }> {

  const fallback = offlineCopy(intent, token, chain, r);
  if (!llmAvailable()) return { copy: fallback, via: "offline writer", theme: intent.theme, accent: intent.accent };
  const system = [
    "You write landing page copy for crypto token websites. Short, punchy, specific to the token. No price predictions, no promises of returns, no invented numbers.",
    `Themes: ${THEME_IDS.map((t) => `${t} (${THEME_NOTES[t]})`).join(", ")}.`,
    "Roadmap items you cannot know must be placeholders in square brackets like [YOUR NEXT GOAL].",
    "You get research on the project: its own descriptions, its website and its recent X posts. Use it.",
    "Write in the team's own voice as measured from their posts (capitals or lowercase, emoji habits, sign-off, pet words). Reuse their phrases; never copy a whole post.",
    "story: the lore in 2-4 sentences from their own descriptions (what it is, where the name or mascot comes from). points: real utility only if the research names it, else []. If there's nothing to go on, story is null.",
    "Never invent partnerships, listings, numbers or utility the research doesn't state.",
    "how: buying happens in the buy box on this site (Buy section, it also takes coins from other chains through NEAR Intents). Never send people to another DEX or app, and never put the contract address in the text (the site shows it with a copy button). Exception: when venue.buyOnLaunchpad is set, the buy box links to that launchpad while the token is on its curve, so say that.",
    "venue: where the token launched and trades, with how that launchpad or DEX works. Use it so How to buy and the FAQ are accurate (still on a bonding curve and buys go into the curve, or graduated to a pool), and give it one FAQ. Never contradict it or add figures it doesn't give.",
    "You may get reference sites the team likes: match their mood and how much they say per section (punchy or wordy, jokey or serious), never their words, names or claims.",
    "fx (optional, how the page moves; pick for the vibe of the request and any reference site, send only what you'd change): motion snappy|calm|bouncy, reveal rise|fade|scale|blur|slide|none, transition none|fade|stack|wave|angle (how sections cross into each other), stagger, intro, nav plain|compact, progress (scroll bar), count (stat numbers count up), toTop, parallax. Loud meme/degen/brutal: snappy or bouncy, angle or stack, progress on. Calm glass/DeFi/app/premium: calm, fade or blur, transition fade or wave. Terminal/trading/serious/minimal: snappy, reveal fade, transition none, intro off. Playful/cozy: bouncy, wave. If the request asks for no animation, reveal none and everything else off.",
    "JSON keys: name, ticker, tagline, theme, accent (#rrggbb, optional), headline (<=8 words), subhead, cta (<=3 words), how[3]{title,body}, faq[3]{q,a}, roadmap[3]{when,title,body}, story{title,body,points[]}|null.",
  ].join("\n");
  const user = JSON.stringify({
    request: prompt,
    chain: CHAINS[chain].name,
    token: token ? { name: token.name, symbol: token.symbol, dex: token.dexId } : null,
    venue: venueFor(token, prompt),
    suggestedTheme: intent.theme,
    research: r ? {
      descriptions: r.descriptions.map((d) => ({ source: d.source, text: d.text.slice(0, 900) })),
      website: r.website ? { title: r.website.title, description: r.website.description, text: r.website.excerpt?.slice(0, 900) } : null,
      x: r.x ? { handle: r.x.profile.handle, bio: r.x.profile.bio, voice: r.x.voice, posts: r.x.posts.slice(0, 12).map((p) => p.text.slice(0, 280)) } : null,
      links: r.links.map((l) => l.label),
    } : null,
    references: refs.length ? refs.map((x) => ({ site: x.host, look: x.notes, sections: refBlockOrder(x) })) : undefined,
  });
  const res = await askJson(system, user, (v) => {
    const p = CopySchema.safeParse(v);
    return p.success ? p.data : null;
  }, backup ? "light" : "heavy", backup ? "backup" : "build");
  if (!res) return { copy: fallback, via: "offline writer", theme: intent.theme, accent: intent.accent };
  const { theme, accent, fx, ...copy } = res.value;
  return { copy: { ...copy, story: copy.story ?? null, ticker: copy.ticker.replace(/^\$/, "").toUpperCase() }, via: res.via, theme: theme ?? intent.theme, accent: intent.accent ?? accent ?? null, fx };
}

// ---------- layout ----------

/** Words that ask for one of the hero compositions (HERO_LAYOUTS). */
const HERO_WORDS: Array<[string, RegExp]> = [
  ["poster", /\b(full[- ]?bleed|poster|image behind|background image|cover image)\b/i],
  ["banner", /\b(banner|featured card|launchpad hero)\b/i],
  ["product", /\b(mock-?up|product shot|app screen(shot)?|show the app)\b/i],
  ["collage", /\b(collage|stickers?|blob|scrapbook)\b/i],
  ["mascot", /\b(mascot (on top|above|first)|logo (on top|above))\b/i],
  ["window", /\b(os window|desktop window|window frame|\.exe)\b/i],
  ["stack", /\b(newspaper|stacked|headline full width)\b/i],
  ["dash", /\b(token bar|stats bar|dashboard hero)\b/i],
];

function block(type: BlockType, props: Record<string, unknown>): Block {
  return { id: `${type}-${newId(5)}`, type, props };
}

function layout(copy: Copy, token: TokenInfo | null, wants: Set<BlockType>, themeId: ThemeId, r: Research | null, treasury: string[] = []): Block[] {
  const hasPair = !!token?.pairAddress;
  // Each style leads with what its kind of site leads with: a terminal puts the chart and tape first,
  // wallet apps and glass DeFi a big centred headline, brutalist sites a huge one.
  const hero = HERO_OF[themeId] ?? HERO_OF.clean;
  const blocks: Block[] = [
    block("nav", {}),
    block("hero", { headline: copy.headline, subhead: copy.subhead, cta: copy.cta, ...hero }),
    // A banner or token-bar hero already carries the numbers; a stats row under it would repeat them.
    ...(hero.layout === "banner" || hero.layout === "dash" ? [] : [block("stats", { items: ["price", "marketCap", token?.venue?.stage === "curve" && token.venue.progress != null ? "curve" : token?.holders != null ? "holders" : "liquidity", "volume24h"] })]),
  ];
  const chart = hasPair || wants.has("chart") ? block("chart", { title: "Chart" }) : null;
  const trades = hasPair || wants.has("trades") ? block("trades", { title: themeId === "retro" ? "Live buys" : "Live trades" }) : null;
  const buy = block("buy", { title: `Buy $${copy.ticker}`, presets: buyPresets(token?.chain) });
  if (themeId === "terminal") blocks.push(...[chart, trades, buy].filter((b): b is Block => !!b));
  else blocks.push(buy);
  if (copy.story && (copy.story.body || copy.story.points.length)) blocks.push(block("story", { title: copy.story.title, body: copy.story.body, points: copy.story.points }));
  if (themeId !== "terminal") blocks.push(...[chart, trades].filter((b): b is Block => !!b));
  blocks.push(block("how", { title: "How to buy", steps: copy.how }));
  if (wants.has("tokenomics")) blocks.push(block("tokenomics", { title: "Tokenomics", style: "bar", rows: [{ label: "[LIQUIDITY]", pct: 80 }, { label: "[COMMUNITY]", pct: 15 }, { label: "[TEAM]", pct: 5 }] }));
  if (wants.has("holders")) blocks.push(block("holders", { title: themeId === "retro" ? "Hi-scores" : "Holders" }));
  if (wants.has("treasury")) blocks.push(block("treasury", { title: "Treasury", body: treasury.length ? "Everything the treasury holds and spends, read straight from the chain." : "Balances of the community multisig, read live.", accounts: treasury }));
  if (wants.has("roadmap") || themeId === "clean" || themeId === "retro") blocks.push(block("roadmap", { title: themeId === "retro" ? "Levels" : "Roadmap", items: copy.roadmap }));
  if (wants.has("signup")) blocks.push(signupBlock(copy.ticker));
  blocks.push(...socialBlocks(wants, copy.ticker).filter((b) => b.type !== "toasts"));
  blocks.push(block("faq", { title: "FAQ", items: copy.faq }));
  if (r?.x?.posts.length) blocks.push(block("posts", { title: themeId === "cozy" ? `from @${r.x.profile.handle}` : `From @${r.x.profile.handle}`, count: 3 }));
  blocks.push(block("socials", { title: "Join us" }));
  if (wants.has("toasts")) blocks.push(socialBlock("toasts", copy.ticker));
  blocks.push(block("footer", { disclaimer: `$${copy.ticker} is a memecoin with no promise of value. Nothing here is financial advice.` }));
  return blocks;
}

/** Amount chips in the buy box, in the chain's native coin. They only fill the amount; nothing is sent until the buyer buys. */
function buyPresets(chain: Chain | undefined): number[] {
  return chain === "solana" ? [0.1, 0.5, 1, 5] : chain === "near" ? [1, 5, 10, 50] : [0.01, 0.05, 0.1, 0.5];
}

// ---------- social blocks (toasts, top buyers, what-if, raid, milestones) ----------

const SOCIAL: BlockType[] = ["toasts", "leaderboard", "pnl", "raid", "milestones"];

function socialBlock(type: BlockType, ticker: string): Block {
  switch (type) {
    case "toasts": return block("toasts", { minUsd: 50, seconds: 6 });
    case "leaderboard": return block("leaderboard", { title: "Top buyers", count: 10 });
    case "pnl": return block("pnl", { title: "What if you'd bought", amount: 100 });
    case "raid": return block("raid", { title: "Spread the word", body: `Post about $${ticker} in one tap.` });
    default: return block("milestones", { title: "Next milestone" });
  }
}

function socialBlocks(wants: Set<BlockType>, ticker: string): Block[] {
  return SOCIAL.filter((t) => wants.has(t)).map((t) => socialBlock(t, ticker));
}

/** "add a leaderboard", "add buy toasts": adds the social block the words name (once). */
function socialComment(spec: SiteSpec, c: PendingComment): boolean {
  if (!/\b(add|put|need|want|include|make|create|give|show)\b/i.test(c.text)) return false;
  const want = readIntent(c.text, spec.chain).wants;
  const add = SOCIAL.filter((t) => want.has(t) && !spec.blocks.some((b) => b.type === t));
  if (!add.length) return false;
  for (const t of add) {
    const foot = spec.blocks.findIndex((b) => b.type === "footer");
    const faq = spec.blocks.findIndex((b) => b.type === "faq" || b.type === "footer");
    const at = t === "toasts" ? foot : faq;
    spec.blocks.splice(at < 0 ? spec.blocks.length : at, 0, socialBlock(t, spec.ticker));
  }
  return true;
}

const article = (w: string) => `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;

const KIND_LABEL: Record<string, string> = { x: "X", telegram: "Telegram", website: "website" };

/** Socials and website as the site shows them. */
export function siteLinks(r: Research): TokenLink[] {
  return r.links.filter((l) => l.type !== "x-community" || !r.links.some((x) => x.type === "x")).map((l) => ({ type: l.type === "x" ? "twitter" : l.type, label: l.label, url: l.url }));
}

/** One line on what research found and, for what it didn't, how to add it. */
export function foundLine(r: Research): string {
  const bits = r.links.filter((l) => ["x", "telegram", "website", "discord"].includes(l.type)).map((l) => (l.type === "x" ? `X @${l.url.split("/").pop()}` : l.type === "website" ? l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : l.label));
  const found = bits.length ? `I found ${bits.join(", ")}${r.x?.posts.length ? ` and read ${r.x.posts.length} recent posts to match your voice` : ""}.` : "I couldn't find any socials for this one yet.";
  const missing = r.missing.map((m) => KIND_LABEL[m]);
  const ask = missing.length ? ` I couldn't find your ${missing.join(" or ")}: paste ${missing.length > 1 ? "them" : "it"} here (a link or @handle) and I'll add ${missing.length > 1 ? "them" : "it"}.` : "";
  return found + ask;
}

export async function runBuild(id: string): Promise<void> {
  const start = await updateProject(id, () => {});
  if (!start) return;
  const prompt = start.prompt;
  let intent = readIntent(prompt, start.network.chain);
  let token: TokenInfo | null = null;
  let chain: Chain = intent.chain ?? start.network.chain;
  let found: Research | null = null;
  let copyRes: Awaited<ReturnType<typeof writeCopy>> | null = null;
  const given = start.socials ?? {};
  // A designed site when a model is available (understand, direct, write, review), else the block site.
  const designing = llmAvailable();
  const mode: BuildMode = designing ? "design" : "blocks";
  const plan = await etaPlan(mode);
  await updateProject(id, (p) => { p.eta = { startedAt: Date.now(), plan }; p.board = {}; });

  await step(id, "intent", "Reading your request", async () => {
    const bits = [intent.ticker ? `$${intent.ticker}` : null, intent.address ? "contract address found" : null, intent.chain ? CHAINS[intent.chain].name : null, venue(intent.venue) ? `${venue(intent.venue)!.name} ${venuesNamed(prompt).includes(intent.venue!) || readToken(prompt)?.link?.venue === intent.venue ? "named" : "address"}` : null, given.x ? `@${given.x.replace(/^@/, "").split("/").pop()}` : null].filter(Boolean);
    return bits.length ? bits.join(" · ") : "No token yet, building from the description";
  });

  await step(id, "chain", "Reading the chain", async () => {
    if (!intent.address) return { skipped: "No contract address yet" };
    token = await tokenContext(intent.address, intent.chain ?? undefined, start.network.rpcUrl);
    if (!token) throw new Error("Couldn't find that token on NEAR, Solana, Ethereum, Base, BNB Chain or Robinhood Chain");
    const t: TokenInfo = token;
    chain = t.chain;
    const facts = [t.name, `$${t.symbol}`, CHAINS[t.chain].name, t.holders != null ? `${t.holders.toLocaleString("en-US")} holders` : null, venueLine(t)].filter(Boolean);
    void onBoard(id, { token: { name: t.name, symbol: t.symbol, chain: t.chain, logo: t.logo, header: t.header, priceUsd: t.priceUsd, marketCap: t.marketCap, holders: t.holders, change24h: t.change24h, launchpad: venue(t.venue?.launchpad)?.name ?? null, stage: t.venue?.stage ?? null } });
    return `${facts.join(" · ")} (via ${t.sources.join(", ") || "chain"})`;
  });

  await step(id, "research", "Finding socials and the story", async () => {
    if (!token && !Object.values(given).some(Boolean)) return { skipped: "Nothing to look up without a contract address or socials" };
    found = await research(token, given);
    const r: Research = found;
    const kinds = r.links.filter((l) => ["x", "telegram", "website", "discord"].includes(l.type)).map((l) => l.label);
    const from = r.sources.filter((x) => x !== "X" && x !== "X profile");
    return `${kinds.length ? kinds.join(", ") : "No socials found"}${from.length ? ` · from ${from.join(", ")}` : ""}${r.lore ? " · story found" : ""}`;
  });

  await step(id, "voice", "Reading their X", async () => {
    const r = found as Research | null;
    if (!r?.x) return { skipped: r?.links.some((l) => l.type === "x") ? "X didn't answer, so I used the bio and site instead" : "No X account found" };
    const v = r.x.voice;
    const notes = v.notes.length ? v.notes.slice(0, 3).join(", ") : "plain voice";
    return `@${r.x.profile.handle}${r.x.profile.followers != null ? ` · ${r.x.profile.followers.toLocaleString("en-US")} followers` : ""} · ${r.x.posts.length ? `${r.x.posts.length} posts, ${notes}` : "profile only"}`;
  });

  {
    const r = found as Research | null;
    if (r) void onBoard(id, { found: {
      links: r.links.filter((l) => ["x", "telegram", "website", "discord"].includes(l.type)).map((l) => ({ type: l.type, label: l.label, url: l.url })).slice(0, 6),
      x: r.x ? { handle: r.x.profile.handle, name: r.x.profile.name, avatar: r.x.profile.avatar, followers: r.x.profile.followers } : null,
      posts: (r.x?.posts ?? []).filter((x) => x.text || x.image).slice(0, 4).map((x) => ({ text: x.text.slice(0, 200), image: x.image })),
      lore: r.lore ? r.lore.slice(0, 400) : null,
    } });
  }

  // The generated-code pass starts reading now, alongside the copywriter: artwork colours, then the analyst's dossier.
  const designBase = (): DesignInput => {
    const t = token as TokenInfo | null;
    return { prompt, token: t, chain, research: found as Research | null, palette: null, style: start.style ?? null, name: t?.name ?? intent.ticker ?? "", ticker: t?.symbol ?? intent.ticker ?? "", tagline: "" };
  };
  const paletteP = designing ? (() => { const r = found as Research | null; const t = token as TokenInfo | null; return paletteOf(t?.logo ?? r?.x?.profile.avatar, t?.header ?? r?.x?.profile.banner).catch(() => null); })() : Promise.resolve(null);
  void paletteP.then((pal) => { if (pal?.swatches.length) void onBoard(id, { colours: pal.swatches.map((x) => x.hex) }); });
  const dossierP: Promise<Dossier | null> = designing ? paletteP.then((palette) => understand({ ...designBase(), palette })).catch(() => null) : Promise.resolve(null);

  // Reference sites: their look and motion, read in a browser. Their sections join the ones the site shows.
  const refs: RefRead[] = [];
  let libRefs: StyleRef[] = [];
  let spec: SiteSpec | null = null;
  // The standard block site. For a designed build it is only the fallback, so it runs quietly alongside the design
  // passes instead of in front of them (its copywriter alone held art direction back by ~40s).
  const run = designing ? quiet : step;
  const fallbackP = (async () => {
  await run(id, "reference", "Studying the reference site", async () => {
    if (!intent.refs.length) {
      libRefs = pickStyleRefs({ vibe: prompt, theme: intent.theme, chain, kind: (found as Research | null)?.meme === false ? "utility" : "meme" });
      return libRefs.length ? `Matched ${libRefs.length} live token sites: ${libRefs.map((x) => x.host).join(", ")}` : { skipped: "No reference site given (add one with ref: https://…)" };
    }
    const read = (await Promise.all(intent.refs.map((u) => readReference(u).catch(() => null)))).filter((x): x is RefRead => !!x);
    refs.push(...read);
    if (!read.length) throw new Error(`Couldn't open ${intent.refs.map((u) => new URL(u).hostname).join(", ")}`);
    for (const t of read.flatMap(refBlockOrder)) if (["tokenomics", "roadmap", "faq", "holders"].includes(t)) intent.wants.add(t);
    return read.map((x) => `${x.host} · ${x.notes.slice(0, 5).join(", ")}`).join(" | ");
  });
  if (refs.length && !start.style && !themeNamed(withoutVenueMentions(withoutRefsText(prompt)))) {
    const t = themeForRef(refs[0]);
    if (t) intent = { ...intent, theme: t };
  }

  // Their voice picks the style when neither the landing page nor the sentence did.
  if (!start.style && !themeNamed(withoutVenueMentions(prompt)) && !refs.length) {
    const t = themeFromResearch(found);
    if (t) intent = { ...intent, theme: t };
  }

  if (libRefs.length && !start.style && !themeNamed(prompt) && !themeFromResearch(found)) intent = { ...intent, theme: themeOfPicks(libRefs, intent.theme) };

  await run(id, "copy", "Writing the copy", async () => {
    copyRes = await writeCopy(prompt, intent, token, chain, found, refs, designing);
    if (start.style) copyRes = { ...copyRes, theme: start.style };
    return `${copyRes.copy.headline} (${copyRes.via})`;
  });

  await run(id, "style", "Picking a style", async () => {
    const themeId = copyRes!.theme;
    intent = { ...intent, theme: themeId };
    // Their own colour beats a guessed one, unless the sentence named a colour. Cozy keeps its ink accent.
    const brand = (found as Research | null)?.brand;
    const fitted = brand ? fitAccent(brand.color, THEMES[themeId].dark) : null;
    if (fitted && !intent.accent && themeId !== "cozy") copyRes = { ...copyRes!, accent: fitted };
    // Without a brand colour, a product named as the look ("like Axiom") lends its own.
    const lent = !fitted && !intent.accent && intent.ref?.accent && themeId === intent.ref.theme ? intent.ref.accent : null;
    if (lent) copyRes = { ...copyRes!, accent: lent };
    const from = brand && copyRes!.accent === fitted ? ` from their ${brand.from}` : lent ? ` from ${intent.ref!.name}` : "";
    return `${THEME_LABELS[themeId]}${copyRes!.accent ? ` · accent ${copyRes!.accent}${from}` : ""}`;
  });

  await run(id, "blocks", "Laying out blocks", async () => {
    const c = copyRes!;
    const r = found as Research | null;
    const base = THEMES[c.theme];
    let theme = c.accent ? { ...base, accent: c.accent, accentText: readableOn(c.accent) } : { ...base };
    // A DAO named in the request or found by research gets the treasury block, wired to its account.
    const treasury = treasuryAccountsIn([prompt, r?.website?.url, r?.website?.excerpt, ...(r?.links ?? []).map((l) => l.url), ...(r?.descriptions ?? []).map((d) => d.text)].filter(Boolean).join("\n"));
    if (treasury.length) intent.wants.add("treasury");
    let blocks = layout(c.copy, token, intent.wants, c.theme, r, treasury);
    // A reference's look over the style, the team's brand colour (or a colour they named) kept; its section order.
    if (refs.length) {
      const brand = intent.accent ?? (r?.brand ? c.accent : null);
      theme = await themeFromRef(refs[0], theme, brand);
      blocks = orderLike(blocks, refBlockOrder(refs[0]));
    }
    // Live token sites like it nudge the look first; the writer's fx and the prompt's own words go on top.
    if (libRefs.length && !refs.length) theme = nudgeTheme(theme, libRefs, !intent.accent && !r?.brand);
    theme = { ...theme, fx: autoFx(theme, c.fx, prompt, refs.length > 0) };
    spec = {
      name: c.copy.name, ticker: c.copy.ticker, tagline: c.copy.tagline, chain, theme, token, blocks,
      links: r ? siteLinks(r) : undefined,
      x: r?.x ? { profile: r.x.profile, posts: r.x.posts.slice(0, 6) } : null,
    };
    await hydrateTreasury(spec);
    return blocks.filter((b) => b.type !== "nav" && b.type !== "footer").map((b) => BLOCK_LABELS[b.type].toLowerCase()).join(", ");
  });
  })();
  if (!designing) await fallbackP;

  await step(id, "wallet", "Wiring wallet and buy box", async () => {
    const t = token as TokenInfo | null;
    const pad = venue(t?.venue?.launchpad);
    const onCurve = t?.venue?.stage === "curve" && pad;
    const route = onCurve && pad.routable === false && t.venue?.buyUrl
      ? `buys open ${pad.name} while $${t.symbol} is on its curve`
      : chain === "solana" ? `in-site swaps through Jupiter${onCurve ? ` (straight into the ${pad.name} curve)` : ""}` : chain === "near" ? "in-site swaps on every launchpad and Rhea through neartrade" : "in-site swaps through KyberSwap";
    const wallets = chain === "solana" ? "Phantom, Solflare, Backpack" : chain === "near" ? "HOT, Meteor, Intear" : "MetaMask, Rabby, Coinbase";
    return `${wallets} · ${route} · any-chain buys through NEAR Intents`;
  });

  // Generated-code site: understand → direct → write, each pass shown as a step. Any pass failing keeps the block site.
  let brief: DesignBrief | null = null;
  let dossier: Dossier | null = null;
  if (designing) {
    // Named from the token when there is one, so art direction never waits for the fallback copywriter.
    const tk = token as TokenInfo | null;
    const named = tk
      ? { name: tk.name, ticker: tk.symbol, tagline: "" }
      : await fallbackP.then(() => { const b = spec as SiteSpec | null; return { name: b?.name ?? intent.ticker ?? "", ticker: b?.ticker ?? intent.ticker ?? "", tagline: b?.tagline ?? "" }; });
    const input: DesignInput = { ...designBase(), palette: await paletteP, ...named };
    await step(id, "understand", "Understanding the project", async () => {
      dossier = await dossierP;
      if (!dossier) throw new Error("Couldn't analyse it this time, so I kept the standard layout");
      const d: Dossier = dossier;
      const inv = Object.entries(d.inventory).filter(([, v]) => v.length).map(([k]) => k);
      void onBoard(id, { story: { oneLiner: d.oneLiner || d.whatItIs, facts: d.facts.slice(0, 5).map((f) => ({ claim: f.claim.slice(0, 220), source: f.source.slice(0, 80) })), tone: d.tone.adjectives.slice(0, 5) } });
      return `${d.oneLiner || d.whatItIs} · ${d.facts.length} facts with sources${inv.length ? ` · has ${inv.join(", ")}` : ""}${input.palette ? ` · ${input.palette.swatches.length} colours from the ${input.palette.from.join(" and ")}` : ""}`;
    });
    if (dossier) await step(id, "direction", "Art direction", async () => {
      brief = await direct(input, dossier!);
      if (!brief) throw new Error("Couldn't settle a direction, so I kept the standard layout");
      const b: DesignBrief = brief;
      const fp = fontPair(b.fontPair);
      const pal = b.palette as Record<string, string>;
      void onBoard(id, { direction: {
        concept: b.concept, archetype: b.archetype, display: fp?.display ?? "", body: fp?.body ?? "",
        fontsHref: fp ? `https://fonts.googleapis.com/css2?${fp.params.join("&")}&display=swap` : "",
        light: b.light, palette: [...new Set(Object.values(pal).filter((v) => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)))].slice(0, 7),
        bg: pal.bg, text: pal.text, accent: pal.accent, heroIdea: b.heroIdea, signature: b.signature,
        sections: b.sections.map((x) => ({ id: x.id, label: x.label, purpose: x.purpose.slice(0, 160) })),
        inspiration: (b.inspiration ?? []).map((x) => ({ ref: x.ref, borrow: x.borrow.slice(0, 260) })),
      } });
      return `${b.archetype.replace(/-/g, " ")} · ${fp ? `${fp.display} + ${fp.body}` : b.fontPair} · ${b.light ? "light" : "dark"} · ${b.sections.map((x) => x.label.toLowerCase()).join(", ")}`;
    });
    // The fallback site's name, links and theme frame the design; it has long finished by now.
    if (dossier && brief) await fallbackP;
    const blockSpec = spec as SiteSpec | null;
    if (dossier && brief && blockSpec) await step(id, "design", "Designing the site", async () => {
      const b: DesignBrief = brief!;
      const theme = themeOfBrief(blockSpec.theme, b);
      const t = blockSpec.token;
      const links = [...(blockSpec.links ?? []), ...(t?.pairUrl ? [{ type: "chart", label: "Chart", url: t.pairUrl }] : []), ...(t?.venue?.buyUrl ? [{ type: "buy", label: "Trade page", url: t.venue.buyUrl }] : [])].filter((l) => /^https:\/\//.test(l.url));
      // Saves run one after another, so a slow write can't land after a newer one.
      let saving = Promise.resolve();
      const out = await writeSite(
        { dossier: dossier!, brief: b, token: t, name: blockSpec.name, ticker: blockSpec.ticker, links, images: imagesOf(input, [blockSpec.logo]) },
        (soFar, label) => {
          saving = saving.then(() => updateProject(id, (p) => {
            p.spec = { ...blockSpec, theme, code: soFar.code, blocks: soFar.blocks };
            const s = p.steps.find((x) => x.id === "design");
            if (s) s.detail = `Wrote ${label.toLowerCase()} (${soFar.blocks.length} of ${b.sections.length})`;
          })).then(() => undefined, () => undefined);
        },
      );
      await saving;
      if (!out) {
        await updateProject(id, (p) => { p.spec = null; });
        throw new Error("The designer didn't finish, so I kept the standard layout");
      }
      spec = { ...blockSpec, theme, code: out.code, blocks: out.blocks };
      void remember(b);
      return `${out.blocks.length} sections, written by ${out.via}`;
    });
    // Look at the result: render it at desktop and phone width, measure layout faults, and let the editor fix what
    // is wrong from the screenshots. A fix that measures worse than the original is thrown away.
    if ((spec as SiteSpec | null)?.code) await step(id, "review", "Reviewing the design", async () => {
      const built = spec as SiteSpec;
      const before = await inspect(staticPage(built.code!, built.blocks));
      if (!before) return { skipped: "No browser here to look at the page" };
      const proj = await getProject(id);
      if (!proj) return null;
      const found = before.issues.length ? `${before.issues.length} layout ${before.issues.length === 1 ? "issue" : "issues"} measured` : "no layout faults measured";
      // Up to two passes: the second only when the first left measured faults and made things better.
      let cur = { spec: built, issues: before.issues, shots: before.shots };
      const notes: string[] = [];
      for (let pass = 0; pass < 2; pass++) {
        if (pass > 0 && !cur.issues.length) break;
        const fixed = await editCode({ ...proj, spec: cur.spec }, [], true, { request: reviewRequest(cur.issues), shots: cur.shots });
        if (!fixed) break;
        const after = await inspect(staticPage(fixed.spec.code!, fixed.spec.blocks));
        if (after && after.issues.length > cur.issues.length) break;
        cur = { spec: fixed.spec, issues: after?.issues ?? [], shots: after?.shots ?? [] };
        notes.push(fixed.message);
        await updateProject(id, (p) => { p.spec = fixed.spec; });
      }
      if (!notes.length) return `Checked at desktop and phone width: ${found}${before.issues.length ? ", couldn't improve on it this time" : ", nothing to change"}`;
      spec = cur.spec;
      return `Checked at desktop and phone width: ${found}, ${cur.issues.length} left${notes.length > 1 ? " after two passes" : ""}. ${notes.join(" ")}`.slice(0, 500);
    });
  }

  await fallbackP;
  const finished = await updateProject(id, (p) => {
    if (!spec) {
      p.status = "error";
      p.messages.push({ id: newId(), role: "agent", text: "I couldn't build this one. Try adding the token name or contract address.", at: Date.now() });
      return;
    }
    p.spec = spec;
    // Renamed while it was still building: the site had no name of its own yet, so it takes that one.
    if (p.name) p.spec.name = p.name;
    p.research = found ?? undefined;
    if (refs.length) p.refs = refs;
    p.network.chain = chain;
    const extra = moreChains(prompt, chain);
    if (extra.length) p.network.chains = [chain, ...extra];
    p.status = "ready";
    p.version += 1;
    const t = (spec as SiteSpec).token;
    const style = THEME_LABELS[(spec as SiteSpec).theme.id].toLowerCase().replace("defi", "DeFi");
    const r = found as Research | null;
    const code = (spec as SiteSpec).code;
    const built = code?.brief
      ? `Designed a one-off site for $${(spec as SiteSpec).ticker}: ${code.brief.concept.replace(/\.$/, "")}.${t ? " Price, holders and trades are live." : ""}`
      : t
      ? `Built ${article(style)} site for $${(spec as SiteSpec).ticker} on ${CHAINS[t.chain].name}. Price, holders and trades are live.`
      : `Built ${article(style)} site. Paste your contract address here to pull in the live price, logo and socials.`;
    p.messages.push({
      id: newId(), role: "agent", at: Date.now(), via: copyRes?.via,
      text: `${built}${refs.length ? ` ${refLine(refs[0], (spec as SiteSpec).theme, refBlockOrder(refs[0]).length > 1)}` : ""}${r ? ` ${foundLine(r)}` : " Paste your X handle and I'll match the copy to how you post."} Click any block in the preview to comment on it.`,
    });
  });
  if (finished?.status === "ready") void recordBuild(mode, finished.steps);
}

// ---------- edits from comments ----------

/** A look the words ask the whole site to take: a product ("like Axiom") or a style word next to style/look/make it. */
function lookNamed(t: string): ThemeId | null {
  const ref = referenceIn(t);
  if (ref && /\b(like|style|look|feel|vibes?|similar|à la|inspired)\b/i.test(t)) return ref.theme;
  if (!/\b(style|theme|look|feel|vibe|make it|whole|site)\b/i.test(t)) return null;
  const id = themeNamed(t);
  // Only words that name a look, not words about the project ("make it about the dog" stays as it is).
  return id && themeNamed(t.replace(/\b(trading|trader|perps?|dashboard|sniper|analytics|wallet|fintech|payments?|app|defi|dex|swaps?|yield|liquidity|bridge|protocol|game|gaming|frog|bunny|treasury|dao|community|grants?|ape|pump|moon|dog|cat|wif|bonk|send)\b/gi, "")) === id ? id : null;
}

/** Effect changes a comment asks for, or null when it asks for none. */
export function fxEdit(text: string, cur: ThemeFx): ThemeFx | null {
  const fx = { ...cur };
  // Clause by clause, so "remove the ticker and use a grid background" doesn't remove the background too.
  for (const t of text.split(/[,;.]|\b(?:and|then|but|also|plus)\b/i)) fxClause(t, fx);
  return (Object.keys(fx) as (keyof ThemeFx)[]).some((k) => fx[k] !== cur[k]) ? fx : null;
}

function fxClause(t: string, fx: ThemeFx): void {
  const off = /\b(no|remove|delete|hide|drop|without|lose|kill|stop)\b/i.test(t);
  if (/\b(ticker|marquee|scrolling (strip|text|banner|bar))\b/i.test(t)) fx.ticker = !off;
  if (/\b(background|bg|behind)\b/i.test(t)) {
    if (off || /\bplain\b/i.test(t)) fx.bg = "none";
    else if (/\bgrid\b/i.test(t) && !/\bdots?\b/i.test(t)) fx.bg = "grid";
    else if (/\b(dots?|dotted|polka)\b/i.test(t)) fx.bg = "dots";
    else if (/\bglow(ing)?\b/i.test(t)) fx.bg = "glow";
    else if (/\b(orbs?|blobs?|bubbles?)\b/i.test(t)) fx.bg = "orbs";
    else if (/\bstripe[sd]?\b/i.test(t)) fx.bg = "stripes";
  }
  if (/\b(cards?|panels?|boxes|surfaces?)\b/i.test(t)) {
    if (/\b(glass(y)?|frosted|blur(red)?)\b/i.test(t)) fx.surface = "glass";
    else if (/\b(hard|offset|brutal(ist)?|sticker)\b/i.test(t)) fx.surface = "offset";
    else if (/\b(soft|shadows?|floating|lifted)\b/i.test(t)) fx.surface = "soft";
    else if (/\b(flat|outlined?|thin borders?)\b/i.test(t)) fx.surface = "outline";
  }
  if (/\b(denser|dense|more compact|tighter|less space|less padding)\b/i.test(t)) fx.density = "compact";
  else if (/\b(more (space|room|breathing room|padding)|airier|airy|spacious|less cramped)\b/i.test(t)) fx.density = "airy";
  if (/\b(animations?|motion|moving|movement)\b/i.test(t) || /\bbouncy|bouncier\b/i.test(t)) {
    if (/\b(bouncy|bouncier|playful|fun|more)\b/i.test(t)) fx.motion = "bouncy";
    else if (/\b(calm|calmer|subtle|less|slower|gentle)\b/i.test(t)) fx.motion = "calm";
    else if (/\b(snappy|snappier|faster|quick|sharp)\b/i.test(t)) fx.motion = "snappy";
  }
  // Scroll effects. "less motion" / "no animations" turns everything off, "make it smoother" turns the good bits on.
  if (/\b(progress|scroll) ?bar\b|\bprogress (indicator|line)\b/i.test(t)) fx.progress = !off;
  if (/\b(back to top|to-top|scroll to top|top button)\b/i.test(t)) fx.toTop = !off;
  if (/\b(count(ing)?[- ]?up|counter|animated (numbers|stats))\b/i.test(t)) fx.count = !off;
  if (/\b(stagger(ed)?|one by one|cascade|cascading|sequence)\b/i.test(t)) fx.stagger = !off;
  if (/\b(intro|page[- ]?(load|enter|entrance)|entrance|hero animation|load animation)\b/i.test(t)) fx.intro = !off;
  if (/\b(sticky|floating|shrinking|compact|blur(ry)?) (nav|navbar|header|menu)\b|\b(nav|navbar|header|menu) (shrink|blur|compact)/i.test(t)) fx.nav = off ? "plain" : "compact";
  if (/\b(section transitions?|cross-?overs?|dividers?|seams?|overlap(ping)?|stack(ed|ing)? sections?|waves?|wavy|diagonal|angled|slanted)\b/i.test(t) || /\b(sections?)\b.*\b(blend|flow|overlap|stack)/i.test(t)) {
    if (off) fx.transition = "none";
    else if (/\b(wave|wavy|curve|curved|curvy)\b/i.test(t)) fx.transition = "wave";
    else if (/\b(angle|angled|diagonal|slant|slanted|skew)/i.test(t)) fx.transition = "angle";
    else if (/\b(stack|stacked|stacking|overlap|overlapping|layered|sheets?|cards? over)\b/i.test(t)) fx.transition = "stack";
    else if (/\b(fade|blend|smooth|soft|gradient|flow)/i.test(t)) fx.transition = "fade";
  }
  // Broad asks: "add scroll animations", "make it smoother", "more polish" switch the whole scroll kit on; "less motion" strips it.
  if (/\b(scroll|scrolling)\b.*\b(animations?|effects?|motion|reveals?)\b|\b(animations?|effects?|reveals?)\b.*\bon scroll\b|\bsmoother\b|\bsmooth(ly)? (scroll|scrolling|feel)\b|\bmore (polish|polished|motion|animated|dynamic|alive|premium)\b|\bfeel (alive|premium|modern|polished)\b/i.test(t) && !off) {
    if (fx.reveal === "none" || !fx.reveal) fx.reveal = "rise";
    fx.stagger = true; fx.intro = true; fx.count = true; fx.nav = "compact";
    if (!fx.transition || fx.transition === "none") fx.transition = fx.surface === "glass" ? "fade" : fx.surface === "offset" ? "angle" : "stack";
    if (/\bsmoother\b/i.test(t) && fx.motion === "snappy") fx.motion = "calm";
  }
  if (/\b(less|reduce|reduced|minimal|minimum|no|fewer|tone down|turn off|disable|stop|kill)\b.*\b(motion|animations?|animated|movement|effects?)\b|\b(make it|fully|totally) static\b|\bcalm(er)? (it )?down\b/i.test(t)) {
    if (/\b(no|turn off|disable|stop|kill|static|remove)\b/i.test(t)) {
      fx.reveal = "none"; fx.transition = "none"; fx.stagger = false; fx.intro = false; fx.count = false; fx.progress = false; fx.parallax = false; fx.nav = "plain";
    } else {
      fx.motion = "calm"; fx.parallax = false; fx.stagger = false; fx.count = false; fx.progress = false;
      if (fx.reveal && fx.reveal !== "none") fx.reveal = "fade";
      if (fx.transition === "angle" || fx.transition === "stack" || fx.transition === "wave") fx.transition = "fade";
    }
  }
  if (/\bbuttons?\b/i.test(t)) {
    if (/\b(pill|rounded|round)\b/i.test(t)) fx.pill = !off;
    else if (/\b(square|sharp|boxy)\b/i.test(t)) fx.pill = false;
  }
}

const EditSchema = z.object({
  blocks: z.array(z.object({ id: z.string(), props: z.record(z.string(), z.unknown()).optional(), remove: z.boolean().optional() })),
  theme: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    id: z.enum(THEME_IDS).optional(),
    fx: z.object({
      bg: z.enum(["none", "grid", "dots", "glow", "orbs", "stripes"]), surface: z.enum(["outline", "soft", "glass", "offset"]),
      motion: z.enum(["snappy", "calm", "bouncy"]), density: z.enum(["compact", "regular", "airy"]), ticker: z.boolean(), pill: z.boolean(),
      reveal: z.enum(["rise", "fade", "scale", "blur", "slide", "none"]), hover: z.enum(["lift", "scale", "glow", "none"]), parallax: z.boolean(),
      transition: z.enum(["none", "fade", "stack", "wave", "angle"]), stagger: z.boolean(), intro: z.boolean(), nav: z.enum(["plain", "compact"]), progress: z.boolean(), count: z.boolean(), toTop: z.boolean(),
    }).partial().optional(),
    radius: z.number().min(0).max(40).optional(),
  }).optional(),
  logo: z.string().max(300).optional(),
  summary: z.string().max(400),
});

/** Pictures on a block or as the logo are only ever the team's own uploads (or what was there already), never a url a model made up. */
function keepOwnImages(next: SiteSpec, prev: SiteSpec, allowed: Set<string>): void {
  for (const b of next.blocks) {
    const img = b.props.image;
    if (img === undefined) continue;
    const before = prev.blocks.find((x) => x.id === b.id)?.props.image;
    if (typeof img !== "string" || (!allowed.has(img) && img !== before)) delete b.props.image;
  }
  if (next.logo && !allowed.has(next.logo) && next.logo !== prev.logo) next.logo = prev.logo ?? null;
}

/** Offline: an uploaded picture goes where the comment says (the logo when it says so), else on the commented hero or story. */
function placeImages(next: SiteSpec, comments: PendingComment[], assets: Map<string, Asset>): string[] {
  const done: string[] = [];
  for (const c of comments) {
    const a = (c.assets ?? []).map((id) => assets.get(id)).find(Boolean);
    if (!a) continue;
    const b = next.blocks.find((x) => x.id === c.blockId);
    if (/\b(logo|icon|pfp|avatar)\b/i.test(c.text) || !b || !["hero", "story"].includes(b.type)) next.logo = a.url;
    else b.props.image = a.url;
    done.push(c.text);
  }
  return done;
}

/** The card corner radius a comment asks for, or null. Site-wide: the blocks share one radius token. */
export function radiusEdit(t: string, cur: number): number | null {
  if (/\bbuttons?\b/i.test(t) && !/\b(cards?|blocks?|boxes|sections?|corners?|everything|these|them|all)\b/i.test(t)) return null;
  if (/\b(sharp|square|squared|boxy|no (rounding|radius|rounded corners))\b/i.test(t) && /\b(corners?|edges?|cards?|blocks?|boxes|these|them|it|everything)\b/i.test(t)) return cur === 0 ? null : 0;
  if (/\b(less rounded|slightly rounded|a bit rounded|subtle(ly)? rounded)\b/i.test(t)) return cur <= 8 ? (cur === 8 ? null : 8) : Math.max(8, cur - 8);
  if (/\b(more rounded|rounder|very rounded|super rounded|really rounded|pill)\b/i.test(t)) return Math.min(40, Math.max(cur + 10, 20));
  if (/\b(rounded|round|curved|soft) ?(corners?|edges?)?\b/i.test(t) && !/\b(around|round up|turnaround)\b/i.test(t)) return cur >= 16 ? Math.min(40, cur + 8) : 20;
  return null;
}

function offlineEdit(spec: SiteSpec, comments: PendingComment[]): { spec: SiteSpec; done: string[]; skipped: string[] } {
  const next: SiteSpec = structuredClone(spec);
  const done: string[] = [];
  const skipped: string[] = [];
  for (const c of comments) {
    const b = next.blocks.find((x) => x.id === c.blockId);
    const t = c.text.trim();
    if (!b) { skipped.push(t); continue; }
    const quoted = t.match(/["“']([^"”']{1,80})["”']/)?.[1];
    const color = colorFromText(t);
    let hit = false;
    // Whole-site look first: "like Axiom", "glass cards", "no ticker". A "remove" aimed at an effect isn't a block removal.
    const look = lookNamed(t);
    if (look && look !== next.theme.id) { next.theme = restyle(next.theme, look, t, color); next.blocks = withHeroOf(next.blocks, look); hit = true; }
    const fx = fxEdit(t, fxOf(next.theme));
    if (fx) { next.theme = { ...next.theme, fx }; hit = true; }
    // Corners: "make these rounded", "rounder", "sharp corners". Buttons alone are fx.pill (above).
    const radius = radiusEdit(t, next.theme.radius);
    if (radius !== null) { next.theme = { ...next.theme, radius }; hit = true; }
    if (!fx && /\b(remove|delete|hide|drop)\b/i.test(t)) { next.blocks = next.blocks.filter((x) => x.id !== b.id); hit = true; }
    else if (/\b(move|put)\b.*\b(up|higher|top|above)\b/i.test(t)) { const i = next.blocks.indexOf(b); if (i > 1) { next.blocks.splice(i, 1); next.blocks.splice(i - 1, 0, b); } hit = true; }
    else if (/\b(move|put)\b.*\b(down|lower|bottom|below)\b/i.test(t)) { const i = next.blocks.indexOf(b); if (i < next.blocks.length - 2) { next.blocks.splice(i, 1); next.blocks.splice(i + 1, 0, b); } hit = true; }
    else {
      // A comment on one element edits that element first.
      const el = c.element && ["headline", "subhead", "cta", "title", "body"].includes(c.element) ? c.element : null;
      if (quoted && el) { b.props[el] = quoted; hit = true; }
      else if (quoted) {
        if (/\b(button|cta)\b/i.test(t) && "cta" in b.props) { b.props.cta = quoted; hit = true; }
        else if (/\b(subtitle|subhead|tagline|description)\b/i.test(t) && "subhead" in b.props) { b.props.subhead = quoted; hit = true; }
        else if ("headline" in b.props) { b.props.headline = quoted; hit = true; }
        else if ("title" in b.props) { b.props.title = quoted; hit = true; }
      }
      const sizeKey = el === "cta" || (!el && /\b(button|cta)\b/i.test(t)) ? "ctaSize" : "size";
      if (/\b(bigger|larger|huge|giant)\b/i.test(t)) { b.props[sizeKey] = "xl"; hit = true; }
      if (/\b(smaller|tiny|compact)\b/i.test(t)) { b.props[sizeKey] = "md"; hit = true; }
      if (/\bdonut|pie\b/i.test(t) && b.type === "tokenomics") { b.props.style = "donut"; hit = true; }
      if (/\bcent(er|re)\b/i.test(t) && b.type === "hero") { b.props.layout = "center"; hit = true; }
      if (/\b(left|side by side|split)\b/i.test(t) && b.type === "hero") { b.props.layout = "split"; hit = true; }
      if (b.type === "hero") {
        const shape = HERO_WORDS.find(([, re]) => re.test(t));
        if (shape) { b.props.layout = shape[0]; if (shape[0] === "product") b.props.mock = /\bphone\b/i.test(t) ? "phone" : "window"; hit = true; }
      }
      if (color && !look) { next.theme = { ...next.theme, accent: color, accentText: readableOn(color) }; hit = true; }
    }
    (hit ? done : skipped).push(t);
  }
  return { spec: next, done, skipped };
}

// Edits a short rule can do for sure: a quoted new text, remove, move, bigger/smaller, a colour, corners. Each one
// alone, in a few words, with no "and" joining a second ask the rules might miss.
const PLAIN_EDIT = /^(?:(?:make |change |set |the )?(?:it|this|these|them|the \w+|\w+)?\s*(?:should )?(?:say|read|to|=)\s*["“'][^"”']{1,80}["”']|(?:please )?(?:remove|delete|hide|drop)(?: (?:it|this|these|them|the \w+))?|move (?:it |this |these |them )?(?:up|down|higher|lower)|make (?:it|this|these|them) (?:bigger|larger|smaller|rounded|rounder|sharp|square|less rounded)|(?:make (?:it|this|these|them) )?(?:red|orange|yellow|green|blue|purple|pink|black|white|#[0-9a-f]{6})|(?:rounded|rounder|sharp|square) corners)\.?$/i;

// A picture with a few words saying where it goes ("use this as the logo", "hero image"): placed without a model.
const PLAIN_PLACE = /^(?:(?:please )?(?:use|make|set|put|add)(?: (?:this|it|these|that|the (?:picture|image|pic)))?(?: (?:as|for|in|on|to be|into))?(?: (?:the|my|our|a))? )?(?:new )?(?:logo|icon|pfp|avatar|hero(?: (?:image|art|picture))?|image|picture|pic|art|artwork|banner|header)(?: (?:here|there|instead))?\.?$/i;

/**
 * How hard a batch of comments is, so credits go where they matter: "free" when every comment is a plain edit the
 * offline editor does for sure (no model is asked), "light" for a few short edits (a small model), "heavy" for
 * anything that rewrites copy, restyles, touches many blocks, or does more with a picture than put it in place.
 */
export function difficulty(comments: PendingComment[], offlineDoes: (c: PendingComment) => boolean): "free" | "light" | "heavy" {
  if (comments.every((c) => (c.assets?.length ? PLAIN_PLACE.test(c.text.trim()) : PLAIN_EDIT.test(c.text.trim()) && offlineDoes(c)))) return "free";
  const blocks = new Set(comments.map((c) => c.blockId)).size;
  const words = comments.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
  const big = /\b(rewrite|redesign|restyle|re-?do|overhaul|whole (site|page)|entire|every|all sections|new section|add (a|an|another) (section|block)|layout|animation|animate|scroll|hover|parallax|like https?:|ref:|reference|story|lore|copy|tone|voice|funn(y|ier)|professional|translate)\b/i;
  if (comments.some((c) => c.assets?.length && !PLAIN_PLACE.test(c.text.trim())) || blocks > 3 || words > 45 || comments.some((c) => big.test(c.text) || c.text.length > 160)) return "heavy";
  return "light";
}

async function applyCommentsRaw(project: Project, comments: PendingComment[]): Promise<{ spec: SiteSpec; message: string; via: string }> {
  const spec = project.spec!;
  const assets = new Map((project.assets ?? []).map((a) => [a.id, a]));
  const tier = difficulty(comments, (c) => offlineEdit(spec, [c]).done.length === 1);
  if (tier !== "free" && llmAvailable()) {
    const touched = spec.blocks.filter((b) => comments.some((c) => c.blockId === b.id));
    const system = [
      "You edit a token website described as JSON blocks. Change only the blocks the comments are about.",
      "Return {blocks:[{id, props?, remove?}], theme?:{accent?, id?, fx?}, summary}. props replaces that block's props entirely, so include every field.",
      `theme.id restyles the whole site: ${THEME_IDS.map((t) => `${t} (${THEME_NOTES[t]})`).join(", ")}.`,
      "theme.radius is the corner radius of cards and blocks in px (0 square, 8 subtle, 20 rounded, 32 very rounded); the site shares one radius.",
      "theme.fx changes effects only: bg none|grid|dots|glow|orbs|stripes, surface outline|soft|glass|offset, motion snappy|calm|bouncy, density compact|regular|airy, ticker (slogan strip under the nav), pill (pill buttons), reveal rise|fade|scale|blur|slide|none (how sections come in on scroll), hover lift|scale|glow|none (cards and buttons under the cursor), parallax (hero art drifts as the page scrolls), transition none|fade|stack|wave|angle (how one section crosses into the next: colour blend, overlapping rounded sheets, wave edge, slanted seam), stagger (cards/steps/stats come in one by one), intro (hero text enters in sequence on load), nav plain|compact (nav blurs and tightens on scroll), progress (scroll progress bar), count (stat numbers count up), toTop (back-to-top button). \"Add scroll animations\" = reveal rise + stagger + transition + intro + count; \"less motion\" = motion calm, reveal fade, transition none/fade, stagger/parallax/progress off; \"no animations\" = reveal none and every motion key off. Send only the keys that change.",
      "Comments can come with images the team uploaded (id, url, size). Use one by its url: props.image on a hero or story block shows it as that block's art; logo (top level) sets the site's logo. Never invent image urls.",
      "treasury block props: {title, body, accounts:[NEAR account or *.sputnik-dao.near, max 3]}. It reads balances, transfers and DAO proposals live from the chain; set only accounts the team gave, never invent one. Keep props.snapshot as it is.",
      "signup block props: {title, body, fields: email|wallet|both, button, success (shown after sending), kind: waitlist|whitelist|newsletter|contact}. Entries go to the project's database.",
      "Live social blocks (props replace entirely): toasts {minUsd (only buys of at least this many USD pop up, default 50), seconds (how long each stays, default 6)}; leaderboard {title, count 3-20}: top buyers from the live trades feed; pnl {title, amount (starting USD, default 100)}: what a buy 1h/24h/7d ago or at launch would be worth now, with Share on X; raid {title, body, posts: up to 5 strings using $TICKER, {ca}, {url}, {chain} placeholders}: ready-made X posts; milestones {title}: market cap and holders progress to the next round number. The buy block also takes presets: up to 5 amounts in the chain's native coin (chips that fill the amount, never send). Never add figures to these; they are read live.",
      "Never invent prices, holder counts or tokenomics numbers; use [PLACEHOLDER] text for facts you don't have.",
      project.knowledge?.trim() ? `The team's standing instructions (always follow, they win over style habits): ${project.knowledge.trim().slice(0, 1500)}` : "",
    ].filter(Boolean).join("\n");
    const imagesOf = (c: PendingComment) => (c.assets ?? []).map((id) => assets.get(id)).filter((a): a is Asset => !!a).map((a) => ({ id: a.id, url: a.url, name: a.name, w: a.w, h: a.h }));
    const user = JSON.stringify({ theme: { id: spec.theme.id, accent: spec.theme.accent, radius: spec.theme.radius, fx: fxOf(spec.theme) }, blocks: touched, comments: comments.map((c) => ({ blockId: c.blockId, element: c.element, text: c.text, images: imagesOf(c), ...(c.context ? { "Context from your connectors": c.context } : {}) })) });
    const res = await askJson(system, user, (v) => {
      const p = EditSchema.safeParse(v);
      return p.success ? p.data : null;
    }, tier, "edit");
    if (res) {
      const next: SiteSpec = structuredClone(spec);
      if (res.value.logo) next.logo = res.value.logo;
      for (const e of res.value.blocks) {
        const i = next.blocks.findIndex((b) => b.id === e.id);
        if (i < 0) continue;
        if (e.remove) next.blocks.splice(i, 1);
        else if (e.props) next.blocks[i] = { ...next.blocks[i], props: e.props };
      }
      if (res.value.theme?.id && res.value.theme.id !== next.theme.id) { next.theme = restyle(next.theme, res.value.theme.id, "", null); next.blocks = withHeroOf(next.blocks, res.value.theme.id); }
      if (res.value.theme?.fx) next.theme = { ...next.theme, fx: { ...fxOf(next.theme), ...res.value.theme.fx } };
      if (res.value.theme?.radius !== undefined) next.theme = { ...next.theme, radius: Math.round(res.value.theme.radius) };
      if (res.value.theme?.accent) next.theme = { ...next.theme, accent: res.value.theme.accent, accentText: readableOn(res.value.theme.accent) };
      keepOwnImages(next, spec, new Set([...assets.values()].map((a) => a.url)));
      return { spec: next, message: res.value.summary, via: res.via };
    }
  }
  const withImages: SiteSpec = structuredClone(spec);
  const placed = placeImages(withImages, comments, assets);
  const r = offlineEdit(withImages, comments.filter((c) => !placed.includes(c.text) || (!PLAIN_PLACE.test(c.text.trim()) && c.text.split(/\s+/).length > 4)));
  r.done.push(...placed);
  if (tier === "free" && !r.skipped.length) return { spec: r.spec, message: `Done: ${[...new Set(r.done)].join("; ")}.`, via: "offline editor" };
  const parts = [`Applied ${new Set(r.done).size} of ${new Set(comments.map((c) => c.text)).size} changes.`];
  // One comment sent to several blocks is listed once.
  const skipped = [...new Set(r.skipped)];
  if (skipped.length) parts.push(`The offline editor couldn't do: ${skipped.map((s) => `"${s}"`).join(", ")}. Set NEAR_AI_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY) in .env.local for free-form edits, or try wording like: button should say "Get it", make it bigger, rounder corners, move up, remove, make it blue.`);
  return { spec: r.spec, message: parts.join(" "), via: "offline editor" };
}

// ---------- treasury ----------

/** Reads each treasury block's accounts once so the page renders with figures at once (cached data; the live page refreshes it). */
export async function hydrateTreasury(spec: SiteSpec): Promise<void> {
  await Promise.all(spec.blocks.filter((b) => b.type === "treasury").map(async (b) => {
    const accounts = [...(Array.isArray(b.props.accounts) ? (b.props.accounts as string[]) : []), ...(typeof b.props.account === "string" && b.props.account ? [b.props.account] : [])].filter((a, i, l) => l.indexOf(a) === i).slice(0, 3);
    const snap = b.props.snapshot as TreasuryData | undefined;
    if (!accounts.length) { delete b.props.snapshot; return; }
    if (snap && snap.accounts.map((a) => a.account).join() === accounts.join()) return;
    const d = await readTreasury(accounts);
    if (d.accounts.some((a) => !a.error)) b.props.snapshot = d; else delete b.props.snapshot;
  }));
}

// ---------- signup form ----------

const SIGNUP_WORDS = /\b(wait ?list|white ?list|allow ?list|sign ?-?ups?|newsletter|early access|mailing list|email list|pre-?register|presale list|collect (emails?|wallets?))\b/i;

function signupFields(t: string): "email" | "wallet" | "both" {
  const w = /\b(wallets?|addresses?|white ?list|allow ?list|presale)\b/i.test(t), e = /\b(e-?mails?|newsletter|mailing)\b/i.test(t);
  return w && e ? "both" : w ? "wallet" : "email";
}

function signupBlock(ticker: string, text = ""): Block {
  const fields = signupFields(text);
  const wl = fields !== "email";
  return block("signup", {
    title: wl ? "Get on the whitelist" : "Join the waitlist",
    body: wl ? `Drop your wallet to get on the $${ticker} list.` : `Be first to hear what's next for $${ticker}.`,
    fields, button: wl ? "Add my wallet" : "Join", success: "You're on the list.", kind: wl ? "whitelist" : "waitlist",
  });
}

/** "add a waitlist", "collect wallets for the whitelist": adds a signup form (or changes the one there). */
function signupComment(spec: SiteSpec, c: PendingComment): boolean {
  if (!SIGNUP_WORDS.test(c.text) || !/\b(add|put|need|want|include|collect|make|create|give)\b/i.test(c.text)) return false;
  const cur = spec.blocks.find((b) => b.type === "signup");
  if (cur) { cur.props.fields = signupFields(c.text); return true; }
  const at = spec.blocks.findIndex((b) => b.id === c.blockId);
  const foot = spec.blocks.findIndex((b) => b.type === "footer");
  spec.blocks.splice(at >= 0 && spec.blocks[at].type !== "footer" ? at + 1 : foot < 0 ? spec.blocks.length : foot, 0, signupBlock(spec.ticker, c.text));
  return true;
}

const NEAR_NAME = /\b[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.near\b/gi;

/** "add our treasury foo.sputnik-dao.near": a comment naming a treasury account sets it on the treasury block (added if the site has none). */
function treasuryComment(spec: SiteSpec, c: PendingComment): boolean {
  if (!/\b(treasury|dao|multisig|grants?|transparen\w*)\b/i.test(c.text)) return false;
  const found = [...new Set((c.text.toLowerCase().match(NEAR_NAME) ?? []).filter(validAccount))].slice(0, 3);
  if (!found.length) return false;
  let tb = spec.blocks.find((b) => b.type === "treasury");
  if (!tb) {
    tb = block("treasury", { title: "Treasury", body: "Everything the treasury holds and spends, read straight from the chain.", accounts: [] });
    const at = spec.blocks.findIndex((b) => b.type === "faq" || b.type === "footer");
    spec.blocks.splice(at < 0 ? spec.blocks.length : at, 0, tb);
  }
  const cur = Array.isArray(tb.props.accounts) ? (tb.props.accounts as string[]) : [];
  tb.props.accounts = (/\b(replace|instead|change|switch)\b/i.test(c.text) ? found : [...cur, ...found]).filter((a, i, l) => l.indexOf(a) === i).slice(0, 3);
  delete tb.props.account;
  return true;
}

export async function applyComments(project: Project, comments: PendingComment[], wholePage = false): Promise<{ spec: SiteSpec; message: string; via: string }> {
  // A generated-code site is edited as code: the editor rewrites the sections and CSS, widgets included.
  if (project.spec?.code) {
    const res = llmAvailable() ? await editCode(project, comments, wholePage) : null;
    return res ?? { spec: project.spec, message: "I couldn't make that change this time. Try again, or double-click any text in the preview to edit it directly.", via: "offline editor" };
  }
  const next: SiteSpec = structuredClone(project.spec!);
  const treasury = comments.filter((c) => treasuryComment(next, c));
  const forms = comments.filter((c) => !treasury.includes(c) && signupComment(next, c));
  const social = comments.filter((c) => !treasury.includes(c) && !forms.includes(c) && socialComment(next, c));
  const mine = [...treasury, ...forms, ...social];
  const rest = comments.filter((c) => !mine.includes(c));
  const res = rest.length ? await applyCommentsRaw({ ...project, spec: next }, rest) : { spec: next, message: "", via: "offline editor" };
  await hydrateTreasury(res.spec);
  if (forms.length) res.message = `Added a signup form; entries show under Database in the toolbar.${res.message ? ` ${res.message}` : ""}`;
  if (social.length) res.message = `Added ${[...new Set(social.flatMap((c) => SOCIAL.filter((t) => readIntent(c.text, next.chain).wants.has(t))))].map((t) => BLOCK_LABELS[t].toLowerCase()).join(", ")}.${res.message ? ` ${res.message}` : ""}`;
  if (treasury.length) res.message = `Treasury set to ${(res.spec.blocks.find((b) => b.type === "treasury")?.props.accounts as string[]).join(", ")}.${res.message ? ` ${res.message}` : ""}`;
  return res;
}
