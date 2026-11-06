import { z } from "zod";
import { askJson, llmAvailable } from "./llm";
import { BLOCK_LABELS, CHAINS, type Project } from "./spec";

// "Enhance": turns a rough request into a clearer one before it's sent (bolt.new's Enhance prompt), for a new site on the
// landing page or a change in the builder. It keeps every fact the person gave and invents none.

const Out = z.object({ text: z.string().min(3).max(1400) });

export async function enhancePrompt(text: string, where: "new" | "change", p?: Project | null): Promise<{ text: string; via: string } | { error: string }> {
  if (!llmAvailable()) return { error: "Enhance needs a model. Add one in Settings." };
  const system = [
    where === "new"
      ? "You rewrite a request for a new token website (memecoin, dApp or NFT) so an AI site builder gets it right the first time."
      : "You rewrite a request to change an existing token website so an AI site editor gets it right the first time.",
    "Keep every fact exactly: names, tickers, contract addresses, chains, links, numbers, colours. Never add facts, tickers, addresses, links, numbers, dates or claims that weren't given.",
    where === "new"
      ? "Make it specific: what the site is for, the look (style, colours, mood, a reference if given), the sections wanted, and the tone of the copy. If something useful is missing, leave a short bracketed gap like [your X link] rather than inventing it."
      : "Make it specific: which sections change, what exactly changes in each, and what must stay as it is. Say it as one clear instruction, at most 5 short lines.",
    "No promises of profit, no \"guaranteed\", no financial advice wording. Plain words. At most 700 characters. Same language as the request.",
    'Reply as {"text":"…"}.',
  ].join("\n");
  const ctx = p?.spec ? { site: { name: p.spec.name, ticker: p.spec.ticker, chain: CHAINS[p.spec.chain].name, sections: p.spec.blocks.map((b) => BLOCK_LABELS[b.type]), style: p.spec.theme.id } } : {};
  const res = await askJson(system, JSON.stringify({ ...ctx, request: text }), (v) => { const r = Out.safeParse(v); return r.success ? r.data : null; }, "light", "edit");
  if (!res) return { error: "Couldn't reach a model just now. Try again." };
  return { text: res.value.text.trim().slice(0, 1200), via: res.via };
}
