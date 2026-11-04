import { readToken, venue as venueById, withoutVenueMentions } from "./venues";
import { refsIn, withoutRefs } from "./reference-urls";
import { colorFromText, referenceIn, themeFromText, withoutReferences } from "./themes";
import type { BlockType, Chain, ThemeId } from "./spec";

// Reads a one-sentence request. Pure, so the landing page can show the same read live as you type.

export interface Intent {
  name: string | null;
  ticker: string | null;
  address: string | null;
  chain: Chain | null;
  theme: ThemeId;
  accent: string | null;
  /** A product named as the look ("like Axiom"): its colour is used only when the team has no brand colour. */
  ref: { name: string; theme: ThemeId; accent: string | null } | null;
  wants: Set<BlockType>;
  /** Reference sites to take the look from ("ref: https://…"). */
  refs: string[];
  /** The launchpad, DEX or aggregator a link or the words name (lib/venues.ts id). */
  venue: string | null;
}

// Base and BNB Chain come before Ethereum: "buy with ETH on Base" is a Base token.
const CHAIN_WORDS: Array<[Chain, RegExp]> = [
  ["robinhood", /\brobinhood\b/i],
  ["solana", /\b(solana|sol|phantom)\b/i],
  ["near", /\bnear\b/i],
  ["base", /\b(on|in|to) base\b|\bbase (chain|network|mainnet|app)\b|\bbasechain\b/i],
  ["bsc", /\b(bsc|bnb|binance smart chain)\b/i],
  ["ethereum", /\b(ethereum|eth|mainnet)\b/i],
];

const WANT_WORDS: Array<[BlockType, RegExp]> = [
  ["holders", /\bholders?\b/i], ["roadmap", /\broadmap|milestones?|plans?\b/i], ["treasury", /\btreasury|multisig|dao|grants?\b/i],
  ["faq", /\bfaq|questions\b/i], ["chart", /\bchart|price\b/i], ["trades", /\btrades|buys|live\b/i], ["tokenomics", /\btokenomics|supply|split\b/i],
];

export function readIntent(prompt: string, fallbackChain: Chain): Intent {
  // Reference sites ("ref: pump.fun") and named looks ("like pump.fun") are a style, never the token or its venue.
  const tok = readToken(withoutRefs(withoutReferences(prompt)));
  const address = tok?.address ?? null;
  const ticker = prompt.match(/\$([A-Za-z][A-Za-z0-9]{1,11})\b/)?.[1]?.toUpperCase() ?? null;
  let chain: Chain | null = null;
  const plain = withoutReferences(prompt);
  // A link names its chain outright; then chain words; then a venue that lives on one chain (pump.fun, four.meme).
  if (tok?.link?.chain) chain = tok.link.chain;
  else for (const [c, re] of CHAIN_WORDS) if (re.test(plain.replace(/\bhttps?:\/\/\S+/g, " "))) { chain = c; break; }
  const v = venueById(tok?.venue);
  if (!chain && v) chain = v.chains.length === 1 ? v.chains[0] : v.id === "uniswap" && !address ? "ethereum" : null;
  if (!chain && tok?.chains.length === 1) chain = tok.chains[0];
  const named = prompt.match(/\b(?:called|named)\s+([A-Z][\w-]{1,20})/)?.[1] ?? null;
  // "launched on pump.fun" or a pump.fun link is where the token trades, not the look it wants.
  const look = withoutVenueMentions(prompt);
  const ref = referenceIn(look);
  const wants = new Set<BlockType>();
  for (const [b, re] of WANT_WORDS) if (re.test(prompt)) wants.add(b);
  return { name: named, ticker, address, chain: chain ?? (address ? null : fallbackChain), theme: themeFromText(look), accent: colorFromText(look), ref: ref ? { name: ref.name, theme: ref.theme, accent: ref.accent } : null, wants, refs: refsIn(prompt), venue: tok?.venue ?? null };
}
