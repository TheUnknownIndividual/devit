import { HERO_OF, THEMES } from "./themes";
import type { Block, BlockType, Chain, SiteSpec, ThemeId, TokenInfo } from "./spec";

// The landing's "Start from a style" previews: one finished, made-up site per style, rendered by the real
// block library at /styles/<id>. Tokens are flagged demo, so prices drift and trades roll in without any
// request leaving the page. Every name, number and line here is invented: no real project, no placeholders.

interface Sample {
  theme: ThemeId;
  chain: Chain;
  name: string;
  ticker: string;
  tagline: string;
  address: string;
  price: number;
  supply: number;
  holders: number;
  change: number;
  hero: { headline: string; subhead: string; cta: string };
  story?: { title: string; body: string; points: string[] };
  how: Array<{ title: string; body: string }>;
  tokenomics?: Array<{ label: string; pct: number }>;
  roadmap?: Array<{ when: string; title: string; body: string }>;
  faq: Array<{ q: string; a: string }>;
  /** The prompt "Use this style" drops into the builder. */
  prompt: string;
  /** The sections after the nav, in order, when the style reads differently from the default run. */
  order?: BlockType[];
  /** A wide picture for the hero, where the style is built around one. */
  image?: string;
}

const SAMPLES: Sample[] = [
  {
    theme: "degen", chain: "solana", name: "Woof Coin", ticker: "WOOF", tagline: "the loudest dog on solana",
    address: "WooF7xkq2RmZ9hT3cVb5NsLpE8aYdGu4JwXr6Pz1Mn", price: 0.00412, supply: 1_000_000_000, holders: 18_420, change: 38.4,
    hero: { headline: "Bark first. Ask later.", subhead: "A dog with a megaphone and a community that never sleeps. No roadmap to the moon, just a very loud walk there.", cta: "Buy $WOOF" },
    story: { title: "Who let him out", body: "Woof started as a sticker on a skateboard and turned into the only dog on Solana with his own fan chants.", points: ["Zero team tokens", "Liquidity burned at launch", "Raids every Friday"] },
    how: [
      { title: "Get a wallet", body: "Phantom or Solflare. Takes a minute." },
      { title: "Load some SOL", body: "Buy it on any exchange and send it over." },
      { title: "Swap for $WOOF", body: "Use the box above. Then bark about it." },
    ],
    tokenomics: [{ label: "Liquidity", pct: 90 }, { label: "Community raids", pct: 7 }, { label: "Marketing", pct: 3 }],
    faq: [
      { q: "Is there a team?", a: "A dog and a group chat. That's the team." },
      { q: "Is the liquidity locked?", a: "Burned at launch. It's not going anywhere." },
      { q: "What's the plan?", a: "Bark louder than every other dog. So far, so good." },
    ],
    prompt: "A loud degen site for $WOOF, a dog coin on Solana, with a live chart and a big buy button",
  },
  {
    theme: "launchpad", chain: "base", name: "Comet", ticker: "COMET", tagline: "the fastest-rising launch on base",
    address: "0x4c0e7a2b9d1f3e5a7c9b1d3f5e7a9c1b3d5f7e9a", price: 0.00731, supply: 1_000_000_000, holders: 7_940, change: 142.6,
    hero: { headline: "Comet is live", subhead: "Launched this morning and already the most traded new token on Base. Market cap, volume and every buy update on this page as they happen.", cta: "Buy $COMET" },
    how: [
      { title: "Connect", body: "Any EVM wallet on Base: Coinbase Wallet, MetaMask or Rabby." },
      { title: "Fund", body: "ETH on Base, or pay from 13 other chains with NEAR Intents." },
      { title: "Buy", body: "Pick an amount, check the quote, confirm." },
    ],
    faq: [
      { q: "When did it launch?", a: "Today. The chart starts at the first block." },
      { q: "Is liquidity locked?", a: "The pool's LP tokens were burned at launch." },
      { q: "Any tax?", a: "None on buys or sells." },
    ],
    prompt: "A professional launchpad-style site for $COMET on Base, like Agora: featured token banner, live stats, trades and buy box",
    order: ["hero", "chart", "trades", "buy", "how", "faq", "socials"],
  },
  {
    theme: "retro", chain: "robinhood", name: "Pixel Pals", ticker: "PIXEL", tagline: "insert coin to continue",
    address: "0x5a3e9c1b7d2f4a6e8c0b1d3f5a7c9e1b3d5f7a9c", price: 0.0219, supply: 420_000_000, holders: 6_880, change: 12.7,
    hero: { headline: "Press start. Hold forever.", subhead: "An 8-bit arcade crew living on Robinhood Chain. Beat the high score, earn the bragging rights.", cta: "Insert $PIXEL" },
    how: [
      { title: "Player 1: wallet", body: "Any EVM wallet set to Robinhood Chain." },
      { title: "Player 2: ETH", body: "Bridge a little ETH over for the swap." },
      { title: "Boss level: swap", body: "Trade ETH for $PIXEL in the box above." },
    ],
    roadmap: [
      { when: "Lvl 1", title: "Arcade opens", body: "Launch, liquidity, the first high scores." },
      { when: "Lvl 2", title: "Tournaments", body: "Weekly score battles between holders." },
      { when: "Lvl 3", title: "Final boss", body: "A pixel game where the token is the extra life." },
    ],
    faq: [
      { q: "What chain?", a: "Robinhood Chain, an EVM chain. Any EVM wallet works." },
      { q: "Is there a game?", a: "Level 3. We're still drawing the sprites." },
      { q: "Continue?", a: "Always. 10… 9… 8…" },
    ],
    prompt: "A retro arcade site for $PIXEL on Robinhood Chain with a hi-score holders board",
  },
  {
    theme: "platform", chain: "ethereum", name: "Meridian", ticker: "MRD", tagline: "settlement for stablecoin apps",
    address: "0x2e9a4c6b8d0f1a3c5e7b9d1f3a5c7e9b1d3f5a7c", price: 2.41, supply: 250_000_000, holders: 28_700, change: 3.1,
    hero: { headline: "Move dollars between apps in one block", subhead: "Meridian settles stablecoin transfers between apps on Ethereum. MRD secures the network and votes on every upgrade.", cta: "Get MRD" },
    story: { title: "Built for the teams moving money", body: "Wallets, payroll apps and exchanges plug into Meridian once and settle with each other directly, without a bridge in the middle.", points: ["One integration", "Final in one block", "Open source"] },
    how: [
      { title: "Connect a wallet", body: "Any Ethereum wallet works." },
      { title: "Choose how to pay", body: "ETH, USDC, or another chain through NEAR Intents." },
      { title: "Receive MRD", body: "Delivered to the wallet you connected." },
    ],
    roadmap: [
      { when: "Q4", title: "Mainnet", body: "Settlement live for the first ten partner apps." },
      { when: "Q1", title: "Open access", body: "Any app can integrate without approval." },
      { when: "Q2", title: "Governance", body: "Every upgrade goes to an MRD vote." },
    ],
    faq: [
      { q: "What does MRD do?", a: "It secures the settlement network and is used to vote on upgrades." },
      { q: "Is the code audited?", a: "Yes, and the reports are public." },
      { q: "Which stablecoins settle?", a: "USDC and USDT at launch." },
    ],
    prompt: "A corporate DeFi infrastructure site for $MRD on Ethereum, like Alchemy: product screen, big stats strip, roadmap",
    order: ["hero", "stats", "story", "how", "buy", "chart", "roadmap", "faq", "socials"],
  },
  {
    theme: "cozy", chain: "ethereum", name: "frog pond", ticker: "FROG", tagline: "a quiet little pond on ethereum",
    address: "0x7f20d4a1e3c5b7d9f1a3c5e7b9d1f3a5c7e9b1d3", price: 0.00087, supply: 690_000_000, holders: 9_150, change: -2.1,
    hero: { headline: "sit by the pond a while", subhead: "frog doesn't rush. frog holds. a soft corner of ethereum for people who'd rather not check charts every five minutes.", cta: "join the pond" },
    story: { title: "about frog", body: "frog lives on a lily pad, eats the occasional fly and has never once panic-sold.", points: ["no taxes", "no team bag", "lots of naps"] },
    how: [
      { title: "get a wallet", body: "metamask, rabby, whatever feels comfy." },
      { title: "bring some eth", body: "just enough for a swap and a little gas." },
      { title: "swap for frog", body: "use the box up top, then go touch grass." },
    ],
    faq: [
      { q: "is frog fast?", a: "no. frog is patient." },
      { q: "any taxes?", a: "none on buys or sells." },
      { q: "where is the pond?", a: "ethereum mainnet, under the big tree." },
    ],
    prompt: "A cozy pastel site for $FROG on Ethereum with how to buy and socials",
  },
  {
    theme: "terminal", chain: "solana", name: "Tape", ticker: "TAPE", tagline: "the tape never lies",
    address: "TaPE3kWm8vRq2cXn7bLs5YdJf9GhU4aZp6Et1Nw", price: 0.0631, supply: 1_000_000_000, holders: 24_900, change: 21.3,
    hero: { headline: "Read the tape", subhead: "A token for people who watch the order flow, not the hype. Live price, live trades, one box to buy.", cta: "Trade $TAPE" },
    how: [
      { title: "Wallet", body: "Phantom, Backpack or Solflare." },
      { title: "Fund", body: "SOL from any exchange, or pay from other chains." },
      { title: "Execute", body: "Quote, sign, done. Routed through Jupiter." },
    ],
    tokenomics: [{ label: "Liquidity", pct: 85 }, { label: "Market makers", pct: 10 }, { label: "Ops", pct: 5 }],
    faq: [
      { q: "Where does the price come from?", a: "Straight from the pool, refreshed every few seconds." },
      { q: "What routes my trade?", a: "Jupiter, for the best price across Solana." },
      { q: "Can I pay from Ethereum?", a: "Yes. Pick ETH or USDC under Pay with in the buy box." },
    ],
    prompt: "A terminal-style site for $TAPE on Solana, like Axiom: live chart, trades and a fast buy box up top",
  },
  {
    theme: "forest", chain: "near", name: "Acorn", ticker: "ACORN", tagline: "small start, long game",
    address: "acorn.sample.near", price: 0.0412, supply: 100_000_000, holders: 5_630, change: 5.2,
    hero: { headline: "From one acorn, a forest", subhead: "ACORN is a community coin on NEAR that plants a real tree for every thousand holders. Small start, long game.", cta: "Plant an ACORN" },
    story: { title: "What Acorn does", body: "Every time the holder count passes another thousand, the community treasury pays a reforestation partner to plant a tree, and posts the receipt.", points: ["One tree per thousand holders", "Receipts posted on chain", "Treasury on NEAR"] },
    how: [
      { title: "Get a NEAR wallet", body: "HOT, Meteor or Intear." },
      { title: "Bring NEAR, or don't", body: "Pay from other chains with NEAR Intents." },
      { title: "Plant your ACORN", body: "Swap in the box below." },
    ],
    roadmap: [
      { when: "Seed", title: "First thousand", body: "The first tree, and the first receipt." },
      { when: "Sprout", title: "Ten thousand", body: "Ten trees and a public planting map." },
      { when: "Oak", title: "A grove", body: "A whole grove named by holders." },
    ],
    faq: [
      { q: "Are the trees real?", a: "Yes. Each planting comes with a partner receipt." },
      { q: "Who holds the treasury?", a: "A NEAR multisig run by the community." },
      { q: "Any tax?", a: "No. The treasury is funded at launch." },
    ],
    prompt: "An illustrated forest site for $ACORN on NEAR, like Oak: deep green, serif titles, big poster hero with a chunky title",
    order: ["hero", "stats", "story", "how", "roadmap", "buy", "chart", "faq", "socials"],
    image: "/samples/forest.svg",
  },
  {
    theme: "brutal", chain: "ethereum", name: "RAW", ticker: "RAW", tagline: "no filter. no roadmap. no apologies.",
    address: "0x3c8e1a5d7b9f2c4e6a8d0b2f4c6e8a0d2b4f6c8e", price: 0.0417, supply: 690_420_000, holders: 12_600, change: 57.9,
    hero: { headline: "STOP TRYING TO BE PRETTY", subhead: "RAW is the internet with the paint scraped off. One token, one meme, one very large font.", cta: "BUY RAW" },
    how: [
      { title: "WALLET", body: "Any EVM wallet. Ethereum mainnet." },
      { title: "ETH", body: "Get some. You know how." },
      { title: "SWAP", body: "Box above. Press the button." },
    ],
    tokenomics: [{ label: "Pool", pct: 95 }, { label: "Burned", pct: 5 }],
    faq: [
      { q: "ROADMAP?", a: "No." },
      { q: "TEAM?", a: "The timeline." },
      { q: "WHY?", a: "Why not." },
    ],
    prompt: "A brutalist internet-native site for $RAW on Ethereum, like SPX6900, with tokenomics",
  },
];

// Hand-drawn marks for the made-up tokens, so the samples look like real launches rather than letter monograms.
const svg = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${body}</svg>`)}`;
const PIX = ["..XXXX..", ".XXXXXX.", "XX.XX.XX", "XXXXXXXX", "XXXXXXXX", "X.XXXX.X", "X.X..X.X", "..X..X.."];
const MARKS: Partial<Record<ThemeId, string>> = {
  degen: svg(`<circle cx="60" cy="60" r="60" fill="#FFE600"/><path d="M40 36C26 34 17 50 21 67c2 10 13 10 16 1l6-28z" fill="#0B0B0B"/><path d="M80 36c14-2 23 14 19 31-2 10-13 10-16 1l-6-28z" fill="#0B0B0B"/><ellipse cx="60" cy="64" rx="27" ry="29" fill="#fff" stroke="#0B0B0B" stroke-width="4.5"/><circle cx="49" cy="58" r="4.6" fill="#0B0B0B"/><circle cx="71" cy="58" r="4.6" fill="#0B0B0B"/><circle cx="50.5" cy="56.5" r="1.4" fill="#fff"/><circle cx="72.5" cy="56.5" r="1.4" fill="#fff"/><ellipse cx="60" cy="71" rx="7" ry="5" fill="#0B0B0B"/><path d="M57 81q3 11 6 0z" fill="#FF4D6D"/><path d="M51 79q9 7 18 0" stroke="#0B0B0B" stroke-width="3.5" fill="none" stroke-linecap="round"/>`),
  retro: svg(`<rect width="120" height="120" fill="#140C2B"/>${PIX.flatMap((row, y) => [...row].map((c, x) => (c === "X" ? `<rect x="${20 + x * 10}" y="${22 + y * 10}" width="10" height="10" fill="#FF4FD8"/>` : ""))).join("")}<rect x="40" y="42" width="10" height="10" fill="#7CF7FF"/><rect x="70" y="42" width="10" height="10" fill="#7CF7FF"/>`),
  cozy: svg(`<rect width="120" height="120" rx="32" fill="#E4EFCB"/><ellipse cx="60" cy="74" rx="40" ry="28" fill="#8BC36A" stroke="#1F2A14" stroke-width="4"/><circle cx="40" cy="46" r="15" fill="#8BC36A" stroke="#1F2A14" stroke-width="4"/><circle cx="80" cy="46" r="15" fill="#8BC36A" stroke="#1F2A14" stroke-width="4"/><circle cx="40" cy="46" r="7" fill="#1F2A14"/><circle cx="80" cy="46" r="7" fill="#1F2A14"/><circle cx="42.5" cy="43.5" r="2.2" fill="#fff"/><circle cx="82.5" cy="43.5" r="2.2" fill="#fff"/><path d="M44 78q16 11 32 0" stroke="#1F2A14" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="33" cy="80" r="5" fill="#F4A7A0" opacity=".85"/><circle cx="87" cy="80" r="5" fill="#F4A7A0" opacity=".85"/>`),
  terminal: svg(`<rect width="120" height="120" rx="24" fill="#0E1220"/><rect x="17" y="30" width="86" height="58" rx="9" fill="#151B30" stroke="#5B7CFF" stroke-width="5"/><rect x="30" y="43" width="60" height="22" rx="11" fill="#5B7CFF" fill-opacity=".18"/><circle cx="44" cy="54" r="7" fill="none" stroke="#5B7CFF" stroke-width="4"/><circle cx="76" cy="54" r="7" fill="none" stroke="#5B7CFF" stroke-width="4"/><path d="M51 54h18" stroke="#5B7CFF" stroke-width="3"/><path d="M35 88l6-11h38l6 11" fill="none" stroke="#5B7CFF" stroke-width="5" stroke-linejoin="round"/><path d="M24 104l14-7 10 4 14-10 12 5 14-11 12 4" stroke="#22C55E" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  brutal: svg(`<rect x="3" y="3" width="114" height="114" fill="#E5FF1A" stroke="#0A0A0A" stroke-width="6"/><path d="M66 14L28 66h26l-8 40 42-56H60z" fill="#0A0A0A" transform="translate(6 6)"/><path d="M66 14L28 66h26l-8 40 42-56H60z" fill="#fff" stroke="#0A0A0A" stroke-width="5" stroke-linejoin="round"/>`),
  launchpad: svg(`<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D7BFF"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#0E0F14"/><path d="M18 96L66 48" stroke="url(#c)" stroke-width="16" stroke-linecap="round" opacity=".35"/><path d="M28 98L70 56" stroke="url(#c)" stroke-width="8" stroke-linecap="round" opacity=".6"/><circle cx="76" cy="44" r="22" fill="url(#c)"/><circle cx="69" cy="37" r="6" fill="#fff" opacity=".55"/>`),
  platform: svg(`<rect width="120" height="120" rx="26" fill="#363FF9"/><path d="M30 86V38l30 30 30-30v48" stroke="#fff" stroke-width="9" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M30 96h60" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>`),
  forest: svg(`<rect width="120" height="120" rx="30" fill="#0A392F"/><path d="M60 34c-17 0-28 9-28 20h56c0-11-11-20-28-20z" fill="#8A5A2B"/><path d="M33 54h54" stroke="#6B421C" stroke-width="5" stroke-linecap="round"/><path d="M38 58c0 22 10 36 22 36s22-14 22-36z" fill="#E2AA5B"/><path d="M60 22v12" stroke="#8A5A2B" stroke-width="6" stroke-linecap="round"/><path d="M60 28c8-8 16-8 20-4" stroke="#C3F56B" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="51" cy="70" rx="4" ry="9" fill="#fff" opacity=".35"/>`),
};

let n = 0;
const block = (type: BlockType, props: Record<string, unknown> = {}): Block => ({ id: `${type}-s${++n}`, type, props });



function token(x: Sample): TokenInfo {
  return {
    chain: x.chain, address: x.address, name: x.name, symbol: x.ticker, decimals: x.chain === "solana" ? 6 : 18,
    logo: MARKS[x.theme], header: null, description: x.tagline, links: [],
    priceUsd: x.price, marketCap: x.price * x.supply, liquidityUsd: x.price * x.supply * 0.11, volume24h: x.price * x.supply * 0.34,
    change24h: x.change, holders: x.holders, supply: x.supply, pairAddress: `sample-${x.ticker.toLowerCase()}`, pairUrl: null, dexId: null,
    sources: [], demo: true,
  } as TokenInfo;
}

function build(x: Sample): SiteSpec {
  const t = THEMES[x.theme];
  const h = HERO_OF[x.theme];
  const lower = x.theme === "cozy";
  const all: Partial<Record<BlockType, Block>> = {
    hero: block("hero", { ...x.hero, layout: h.layout, size: h.size, ...(h.mock ? { mock: h.mock } : {}), ...(x.image ? { image: x.image } : {}) }),
    stats: block("stats", { items: ["price", "marketCap", "holders", "volume24h"] }),
    chart: block("chart", { title: x.theme === "platform" ? "Price and volume, live" : "Chart" }),
    trades: block("trades", { title: x.theme === "retro" ? "Live buys" : x.theme === "launchpad" ? "Latest buys" : "Live trades" }),
    buy: block("buy", { title: x.theme === "brutal" ? `BUY $${x.ticker}` : `Buy $${x.ticker}` }),
    how: block("how", { title: lower ? "how to join" : x.theme === "platform" ? "Get MRD in three steps" : "How to buy", steps: x.how }),
    faq: block("faq", { title: x.theme === "platform" ? "Questions teams ask" : "FAQ", items: x.faq }),
    socials: block("socials", { title: lower ? "come say hi" : x.theme === "storybook" ? "Come sit with us" : "Join us" }),
  };
  if (x.story) all.story = block("story", x.story);
  if (x.tokenomics) all.tokenomics = block("tokenomics", { title: "Tokenomics", style: x.theme === "glass" || x.theme === "app" ? "donut" : "bar", rows: x.tokenomics });
  if (x.roadmap) all.roadmap = block("roadmap", { title: x.theme === "retro" ? "Levels" : x.theme === "forest" ? "How the grove grows" : "Roadmap", items: x.roadmap });
  const order: BlockType[] = x.order ?? (x.theme === "terminal"
    ? ["hero", "chart", "trades", "buy", "story", "how", "tokenomics", "roadmap", "faq", "socials"]
    : ["hero", "stats", "buy", "story", "chart", "trades", "how", "tokenomics", "roadmap", "faq", "socials"]);
  const blocks: Block[] = [block("nav"), ...order.map((k) => all[k]).filter((b): b is Block => !!b)];
  blocks.push(block("footer", { disclaimer: `This is a sample site made with devit. $${x.ticker} is made up and can't be bought.` }));
  return {
    name: x.name, ticker: x.ticker, tagline: x.tagline, chain: x.chain, theme: { ...t, fx: t.fx ? { ...t.fx } : undefined },
    token: token(x), blocks, logo: MARKS[x.theme],
    links: [{ type: "x", label: "X", url: "#x" }, { type: "telegram", label: "Telegram", url: "#telegram" }],
  };
}

export const SHOWCASE: Partial<Record<ThemeId, SiteSpec>> = Object.fromEntries(SAMPLES.map((x) => [x.theme, build(x)]));

/** What the landing's chips need, without shipping every whole spec to the browser. */
export const SHOWCASE_LIST = SAMPLES.map((x) => ({
  id: x.theme, ticker: x.ticker, name: x.name, chain: x.chain, accent: THEMES[x.theme].accent, dark: THEMES[x.theme].dark,
  bg: THEMES[x.theme].bg, prompt: x.prompt, logo: MARKS[x.theme],
}));
