import { SHOWCASE_LIST } from "./showcase";
import type { Chain, ThemeId } from "./spec";

// The /templates gallery: the landing's sample sites (lib/showcase.ts), each tagged with what it is a start for.
// "Use template" sends the visitor to the prompt box with that style and kind already chosen.

export type TemplateKind = "memecoin" | "dapp" | "nft";
export const TEMPLATE_KINDS: Array<{ id: TemplateKind; label: string }> = [
  { id: "memecoin", label: "Memecoin" }, { id: "dapp", label: "dApp" }, { id: "nft", label: "NFT" },
];

export interface Template { key: string; style: ThemeId; kind: TemplateKind; title: string; note: string; ticker: string; chain: Chain; bg: string }

// Which kind each sample is a start for, and a plain line on what it is. NFT starts reuse a sample's look.
const TAGS: Array<{ style: ThemeId; kind: TemplateKind; title: string; note: string }> = [
  { style: "degen", kind: "memecoin", title: "Loud dog coin", note: "Big yellow headline, live chart and trades, one huge buy button." },
  { style: "clean", kind: "dapp", title: "Community grants", note: "Calm and readable, with a roadmap, treasury and FAQ." },
  { style: "retro", kind: "memecoin", title: "Arcade coin", note: "Pixel arcade look with a hi-score board for holders." },
  { style: "cozy", kind: "memecoin", title: "Pond coin", note: "Soft, friendly and rounded for a gentle community token." },
  { style: "terminal", kind: "dapp", title: "Trading tape", note: "Chart and live trades first, in monospace." },
  { style: "app", kind: "dapp", title: "Wallet app", note: "A big centred headline in the style of a wallet app." },
  { style: "brutal", kind: "memecoin", title: "No filter", note: "Huge type, hard edges, nothing polite about it." },
  { style: "glass", kind: "dapp", title: "Liquidity app", note: "Frosted panels on a dark gradient for DeFi." },
  { style: "retro", kind: "nft", title: "Pixel mint page", note: "Retro pixel mint page with a roadmap and FAQ." },
  { style: "cozy", kind: "nft", title: "Gentle gallery mint", note: "A quiet, rounded gallery-style mint page." },
];

export const TEMPLATES: Template[] = TAGS.flatMap((t) => {
  const s = SHOWCASE_LIST.find((x) => x.id === t.style);
  return s ? [{ key: `${t.style}-${t.kind}`, ...t, ticker: s.ticker, chain: s.chain, bg: s.bg }] : [];
});

/** Where "Use template" goes: the landing prompt box with the style and kind chosen. */
export const templateHref = (t: Pick<Template, "style" | "kind">) => `/?style=${t.style}&kind=${t.kind}#start`;
