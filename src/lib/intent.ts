import { findAddress } from "./address";
import { refsIn } from "./reference-urls";
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
}

const CHAIN_WORDS: Array<[Chain, RegExp]> = [
  ["robinhood", /\brobinhood\b/i],
  ["solana", /\b(solana|sol|pump\.?fun|phantom)\b/i],
  ["near", /\bnear\b/i],
  ["ethereum", /\b(ethereum|eth|mainnet|uniswap)\b/i],
];

const WANT_WORDS: Array<[BlockType, RegExp]> = [
  ["holders", /\bholders?\b/i], ["roadmap", /\broadmap|milestones?|plans?\b/i], ["treasury", /\btreasury|multisig|dao|grants?\b/i],
  ["faq", /\bfaq|questions\b/i], ["chart", /\bchart|price\b/i], ["trades", /\btrades|buys|live\b/i], ["tokenomics", /\btokenomics|supply|split\b/i],
];

export function readIntent(prompt: string, fallbackChain: Chain): Intent {
  const address = findAddress(prompt);
  const ticker = prompt.match(/\$([A-Za-z][A-Za-z0-9]{1,11})\b/)?.[1]?.toUpperCase() ?? null;
  let chain: Chain | null = null;
  const plain = withoutReferences(prompt);
  for (const [c, re] of CHAIN_WORDS) if (re.test(plain)) { chain = c; break; }
  const named = prompt.match(/\b(?:called|named)\s+([A-Z][\w-]{1,20})/)?.[1] ?? null;
  const ref = referenceIn(prompt);
  const wants = new Set<BlockType>();
  for (const [b, re] of WANT_WORDS) if (re.test(prompt)) wants.add(b);
  return { name: named, ticker, address, chain: chain ?? (address ? null : fallbackChain), theme: themeFromText(prompt), accent: colorFromText(prompt), ref: ref ? { name: ref.name, theme: ref.theme, accent: ref.accent } : null, wants, refs: refsIn(prompt) };
}
