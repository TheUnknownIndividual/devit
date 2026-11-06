import { z } from "zod";
import { askJson, llmAvailable } from "./llm";
import { connectorContext } from "./connector-context";
import { readIntent } from "./intent";
import { THEME_LABELS } from "./themes";
import { BLOCK_LABELS, CHAINS, THEME_IDS, type BlockType, type Chain, type Project, type ThemeId } from "./spec";

// The agent answering without changing the site: "plan" says what it would change and waits for a go-ahead; "ask"
// answers a question about the site. Plus the plan shown on the landing page before the first build.

const knowledgeLine = (p: Pick<Project, "knowledge">) => (p.knowledge?.trim() ? `The team's standing instructions (always follow): ${p.knowledge.trim().slice(0, 1500)}` : "");

/** The site as the model reads it: block ids, types and copy, kept short. */
function siteBrief(p: Project): string {
  const s = p.spec!;
  const blocks = s.blocks.map((b) => ({ id: b.id, type: b.type, props: JSON.stringify(b.props).slice(0, 600) }));
  return JSON.stringify({
    name: s.name, ticker: s.ticker, tagline: s.tagline, chain: CHAINS[s.chain].name, style: s.theme.id, accent: s.theme.accent,
    token: s.token ? { symbol: s.token.symbol, address: s.token.address, price: s.token.priceUsd, marketCap: s.token.marketCap, holders: s.token.holders } : null,
    links: (s.links ?? []).map((l) => l.label), published: !!p.published, blocks,
  }).slice(0, 9000);
}

const Reply = z.object({ reply: z.string().min(1).max(3000), steps: z.array(z.string().max(300)).max(12).optional() });

export async function planChange(p: Project, text: string): Promise<{ reply: string; steps: string[]; via: string }> {
  if (!llmAvailable()) return { reply: "Plan mode needs a model. Add one in Settings, or send the change without Plan.", steps: [], via: "offline editor" };
  const cx = await connectorContext(p, text);
  const system = [
    "You plan edits to a token website made of JSON blocks, before anything changes. Don't change anything now.",
    "Reply with {reply, steps}. reply: one or two plain sentences on the approach. steps: 2-8 short concrete changes, each naming the section (e.g. 'Hero: headline becomes …', 'Add a Roadmap after How to buy').",
    `Sections you can add: ${Object.values(BLOCK_LABELS).join(", ")}. Styles: ${THEME_IDS.join(", ")}.`,
    "Never invent prices, holder counts, partnerships or tokenomics; say [PLACEHOLDER] where a fact is missing.",
    knowledgeLine(p),
  ].filter(Boolean).join("\n");
  const res = await askJson(system, JSON.stringify({ site: siteBrief(p), request: text, ...(cx.text ? { "Context from your connectors": cx.text } : {}) }), (v) => { const r = Reply.safeParse(v); return r.success ? r.data : null; }, "light", "edit");
  if (!res) return { reply: "I couldn't reach a model just now. Try again in a moment.", steps: [], via: "offline editor" };
  return { reply: res.value.reply, steps: res.value.steps ?? [], via: cx.used.length ? `${res.via} · read ${cx.used.join(", ")}` : res.via };
}

export async function askAbout(p: Project, text: string): Promise<{ reply: string; via: string }> {
  if (!llmAvailable()) return { reply: "Questions need a model. Add one in Settings.", via: "offline editor" };
  const cx = await connectorContext(p, text);
  const system = [
    "You answer questions about a token website the team is building in sitesmith. Don't change anything; if they want a change, say what to ask for.",
    "Answer in at most 5 short sentences, plainly. Use the site JSON for facts about the page; don't invent token facts.",
    "Builder facts: Publish puts it at <slug>.<sites domain>; custom domains, private links and passwords are on Pro; Export sends the code to GitHub or a zip; Database keeps signup entries; Integrations sets WalletConnect and Privy; double-click text in the preview to type over it; History restores any earlier version.",
    knowledgeLine(p),
  ].filter(Boolean).join("\n");
  const res = await askJson(system, JSON.stringify({ site: siteBrief(p), question: text, ...(cx.text ? { "Context from your connectors": cx.text } : {}) }), (v) => { const r = Reply.safeParse(v); return r.success ? r.data : null; }, "light", "edit");
  if (!res) return { reply: "I couldn't reach a model just now. Try again in a moment.", via: "offline editor" };
  return { reply: res.value.reply, via: cx.used.length ? `${res.via} · read ${cx.used.join(", ")}` : res.via };
}

// ---------- landing plan ----------

export interface SitePlan {
  name: string | null;
  style: ThemeId;
  sections: Array<{ type: BlockType; label: string; why: string; on: boolean }>;
  notes: string[];
  via: string;
}

/** Sections every token site gets, and optional ones a plan can switch on. */
const CORE: BlockType[] = ["nav", "hero", "stats", "buy", "how", "faq", "socials", "footer"];
const OPTIONAL: BlockType[] = ["chart", "trades", "story", "tokenomics", "holders", "roadmap", "signup", "treasury", "posts"];
const OPTIONAL_WHY: Partial<Record<BlockType, string>> = {
  chart: "Live price chart from the pool", trades: "Buys and sells as they happen", story: "The lore behind the name",
  tokenomics: "How the supply is split", holders: "Top wallets, read live", roadmap: "What's next, step by step",
  signup: "Collect emails or wallets for a waitlist", treasury: "Multisig balances read from the chain", posts: "Recent posts from your X",
};

const PlanSchema = z.object({
  name: z.string().max(40).nullable().optional(),
  style: z.enum(THEME_IDS).optional(),
  sections: z.array(z.object({ type: z.string(), why: z.string().max(140) })).max(20),
  notes: z.array(z.string().max(200)).max(6).optional(),
});

export async function planSite(prompt: string, kind: string, chain: Chain, style?: ThemeId): Promise<SitePlan> {
  const intent = readIntent(prompt, chain);
  const pick = style ?? intent.theme;
  const base = (on: Set<BlockType>): SitePlan["sections"] => [
    ...CORE.map((t) => ({ type: t, label: BLOCK_LABELS[t], why: t === "buy" ? "Buy with any coin from any chain" : t === "hero" ? "Headline, tagline and the main button" : t === "stats" ? "Price, market cap, volume" : "", on: true })),
    ...OPTIONAL.map((t) => ({ type: t, label: BLOCK_LABELS[t], why: OPTIONAL_WHY[t] ?? "", on: on.has(t) })),
  ];
  const wanted = new Set<BlockType>([...intent.wants, ...(intent.address ? (["chart", "trades"] as BlockType[]) : [])]);
  const offline: SitePlan = { name: intent.name ?? intent.ticker, style: pick, sections: base(wanted), notes: [intent.address ? "Live data comes from the contract address." : "Paste a contract address to get live price, chart and trades."], via: "offline" };
  if (!llmAvailable()) return offline;
  const system = [
    `You plan a ${kind} website before it is built. Pick which optional sections fit the request and say why in under 12 words each.`,
    `Optional sections (type: what it is): ${OPTIONAL.map((t) => `${t}: ${OPTIONAL_WHY[t]}`).join("; ")}.`,
    `Styles: ${THEME_IDS.map((t) => `${t} (${THEME_LABELS[t]})`).join(", ")}.${style ? ` The team picked ${style}; keep it.` : ""}`,
    "Reply {name|null, style, sections:[{type, why}] (optional sections to include only), notes:[up to 3 short things to know before building, like missing info]}.",
  ].join("\n");
  const res = await askJson(system, JSON.stringify({ request: prompt, chain: CHAINS[intent.chain ?? chain].name }), (v) => { const r = PlanSchema.safeParse(v); return r.success ? r.data : null; }, "light", "edit");
  if (!res) return offline;
  const on = new Set(res.value.sections.map((s) => s.type).filter((t): t is BlockType => (OPTIONAL as string[]).includes(t)));
  const whys = new Map(res.value.sections.map((s) => [s.type, s.why]));
  return {
    name: res.value.name ?? offline.name,
    style: style ?? res.value.style ?? pick,
    sections: base(new Set([...on, ...wanted])).map((s) => ({ ...s, why: whys.get(s.type) || s.why })),
    notes: res.value.notes ?? offline.notes,
    via: res.via,
  };
}

/** Words for the build prompt that switch on the planned sections (lib/intent.ts reads them). */
export const SECTION_WORDS: Partial<Record<BlockType, string>> = {
  chart: "chart", trades: "live trades", tokenomics: "tokenomics", holders: "holders", roadmap: "roadmap", signup: "waitlist", treasury: "treasury", faq: "faq",
};
