import { THEMES } from "./themes";
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
    theme: "clean", chain: "near", name: "Grant Garden", ticker: "GRNT", tagline: "community grants, grown in the open",
    address: "grnt.sample.near", price: 0.184, supply: 50_000_000, holders: 3_210, change: 4.2,
    hero: { headline: "Small grants, planted early", subhead: "Holders vote every month on which open-source builders on NEAR get funded. Every grant and every vote is public.", cta: "Join the garden" },
    story: { title: "Why a garden", body: "Most grants arrive too late. Grant Garden funds the first commit, not the hundredth, and lets the people holding the token decide where it goes.", points: ["Monthly rounds", "On-chain votes", "Public reports"] },
    how: [
      { title: "Connect a NEAR wallet", body: "Meteor, HOT or MyNEARWallet all work." },
      { title: "Pick up some GRNT", body: "Swap NEAR for GRNT here, or pay from any chain with NEAR Intents." },
      { title: "Vote each round", body: "One token, one vote, counted on chain." },
    ],
    roadmap: [
      { when: "Q4", title: "First round", body: "Ten builders, ten small grants." },
      { when: "Q1", title: "Builder reports", body: "Every funded project posts what it shipped." },
      { when: "Q2", title: "Open proposals", body: "Anyone can put a project up for a vote." },
    ],
    faq: [
      { q: "Who picks the grants?", a: "Holders, by vote, every month." },
      { q: "Where does the money come from?", a: "A share of every trade goes to the grant pool." },
      { q: "Can I apply?", a: "Yes. Proposals open to everyone from Q2." },
    ],
    prompt: "A clean site for $GRNT, a NEAR community grants token, with roadmap and FAQ",
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
      { title: "Fund", body: "SOL from any exchange, or pay from any chain." },
      { title: "Execute", body: "Quote, sign, done. Routed through Jupiter." },
    ],
    tokenomics: [{ label: "Liquidity", pct: 85 }, { label: "Market makers", pct: 10 }, { label: "Ops", pct: 5 }],
    faq: [
      { q: "Where does the price come from?", a: "Straight from the pool, refreshed every few seconds." },
      { q: "What routes my trade?", a: "Jupiter, for the best price across Solana." },
      { q: "Can I pay from Ethereum?", a: "Yes, through NEAR Intents in the Any chain tab." },
    ],
    prompt: "A terminal-style site for $TAPE on Solana, like Axiom: live chart, trades and a fast buy box up top",
  },
  {
    theme: "app", chain: "ethereum", name: "Paws Wallet", ticker: "PAWS", tagline: "the friendliest token in your wallet",
    address: "0x9b41c3e5a7d9f1b3c5e7a9d1f3b5c7e9a1d3f5b7", price: 0.312, supply: 100_000_000, holders: 41_300, change: 6.9,
    hero: { headline: "Crypto, but it wags back", subhead: "PAWS rewards people for showing friends around web3. Simple app, soft edges, no jargon.", cta: "Get $PAWS" },
    story: { title: "Built for first-timers", body: "Most people's first crypto moment is confusing. PAWS makes it a good one: one tap to swap, one tap to share.", points: ["One-tap swaps", "Referral paws", "Works on any EVM wallet"] },
    how: [
      { title: "Download any wallet", body: "MetaMask, Rainbow or Coinbase Wallet." },
      { title: "Add a little ETH", body: "Buy it in your wallet app with a card." },
      { title: "Swap for PAWS", body: "Right here, in about ten seconds." },
    ],
    roadmap: [
      { when: "Now", title: "Swap and share", body: "Buy PAWS and send friends a link." },
      { when: "Next", title: "Paw points", body: "Points for every friend you bring in." },
      { when: "Later", title: "Mobile app", body: "The whole thing in your pocket." },
    ],
    faq: [
      { q: "Do I need to know crypto?", a: "No. If you can send a text, you can use PAWS." },
      { q: "Which wallets work?", a: "Any EVM wallet on Ethereum." },
      { q: "Is it safe?", a: "Contract is verified and ownership is renounced." },
    ],
    prompt: "A friendly wallet-app style site for $PAWS on Ethereum, like MetaMask, with how to buy and FAQ",
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
  {
    theme: "glass", chain: "near", name: "Flow", ticker: "FLOW", tagline: "liquidity that moves with you",
    address: "flow.sample.near", price: 1.37, supply: 200_000_000, holders: 15_480, change: 9.6,
    hero: { headline: "Swap anything, from anywhere", subhead: "Flow routes your trade across chains with NEAR Intents. Pick what you have, pick what you want, sign once.", cta: "Launch Flow" },
    story: { title: "One signature, any chain", body: "Bring ETH, SOL or USDC from wherever it lives. Flow finds the route and delivers to your NEAR wallet.", points: ["Cross-chain by default", "Best route each time", "Settles in seconds"] },
    how: [
      { title: "Connect", body: "Any NEAR wallet, or pay from another chain." },
      { title: "Choose", body: "What you pay with and how much." },
      { title: "Sign once", body: "NEAR Intents handles the rest." },
    ],
    tokenomics: [{ label: "Liquidity", pct: 60 }, { label: "Ecosystem", pct: 25 }, { label: "Contributors", pct: 15 }],
    faq: [
      { q: "Which chains can I pay from?", a: "Ethereum, Solana, Base, Arbitrum and more through NEAR Intents." },
      { q: "How long does it take?", a: "Usually under a minute end to end." },
      { q: "What does FLOW do?", a: "It's the token of the Flow community and its routing rewards." },
    ],
    prompt: "A glassy DeFi site for $FLOW on NEAR, like Uniswap, with liquidity stats and the swap box",
  },
];

let n = 0;
const block = (type: BlockType, props: Record<string, unknown> = {}): Block => ({ id: `${type}-s${++n}`, type, props });

const HERO: Partial<Record<ThemeId, { layout: string; size: string }>> = {
  terminal: { layout: "split", size: "md" }, app: { layout: "center", size: "xl" }, brutal: { layout: "split", size: "xl" }, glass: { layout: "center", size: "lg" },
};

function token(x: Sample): TokenInfo {
  return {
    chain: x.chain, address: x.address, name: x.name, symbol: x.ticker, decimals: x.chain === "solana" ? 6 : 18,
    logo: null, header: null, description: x.tagline, links: [],
    priceUsd: x.price, marketCap: x.price * x.supply, liquidityUsd: x.price * x.supply * 0.11, volume24h: x.price * x.supply * 0.34,
    change24h: x.change, holders: x.holders, supply: x.supply, pairAddress: `sample-${x.ticker.toLowerCase()}`, pairUrl: null, dexId: null,
    sources: [], demo: true,
  } as TokenInfo;
}

function build(x: Sample): SiteSpec {
  const t = THEMES[x.theme];
  const chart = block("chart", { title: "Chart" });
  const trades = block("trades", { title: x.theme === "retro" ? "Live buys" : "Live trades" });
  const buy = block("buy", { title: x.theme === "brutal" ? `BUY $${x.ticker}` : `Buy $${x.ticker}` });
  const blocks: Block[] = [
    block("nav"),
    block("hero", { ...x.hero, ...(HERO[x.theme] ?? { layout: "split", size: "lg" }) }),
    block("stats", { items: ["price", "marketCap", "holders", "volume24h"] }),
  ];
  if (x.theme === "terminal") blocks.push(chart, trades, buy);
  else blocks.push(buy);
  if (x.story) blocks.push(block("story", x.story));
  if (x.theme !== "terminal") blocks.push(chart, trades);
  blocks.push(block("how", { title: x.theme === "cozy" ? "how to join" : "How to buy", steps: x.how }));
  if (x.tokenomics) blocks.push(block("tokenomics", { title: "Tokenomics", style: x.theme === "glass" || x.theme === "app" ? "donut" : "bar", rows: x.tokenomics }));
  if (x.roadmap) blocks.push(block("roadmap", { title: x.theme === "retro" ? "Levels" : "Roadmap", items: x.roadmap }));
  blocks.push(block("faq", { title: "FAQ", items: x.faq }));
  blocks.push(block("socials", { title: x.theme === "cozy" ? "come say hi" : "Join us" }));
  blocks.push(block("footer", { disclaimer: `This is a sample site made with sitesmith. $${x.ticker} is made up and can't be bought.` }));
  return {
    name: x.name, ticker: x.ticker, tagline: x.tagline, chain: x.chain, theme: { ...t, fx: t.fx ? { ...t.fx } : undefined },
    token: token(x), blocks,
    links: [{ type: "x", label: "X", url: "#x" }, { type: "telegram", label: "Telegram", url: "#telegram" }],
  };
}

export const SHOWCASE: Record<ThemeId, SiteSpec> = Object.fromEntries(SAMPLES.map((x) => [x.theme, build(x)])) as Record<ThemeId, SiteSpec>;

/** What the landing's chips need, without shipping eight whole specs to the browser. */
export const SHOWCASE_LIST = SAMPLES.map((x) => ({
  id: x.theme, ticker: x.ticker, name: x.name, chain: x.chain, accent: THEMES[x.theme].accent, dark: THEMES[x.theme].dark,
  bg: THEMES[x.theme].bg, prompt: x.prompt,
}));
