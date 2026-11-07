import { CHAINS, type Project, type SiteSpec } from "./spec";
import { PLANS } from "./plans";
import { sitesDomain } from "./sites";

// Everything search engines and AI assistants read about us and about each published site: the canonical origin,
// the facts (one list feeds the visible FAQ, the JSON-LD and llms.txt so they never disagree), and the per-site
// structured data built from a site's spec.

export const BRAND = "devit";
const DEFAULT_ORIGIN = "https://devit.lol";

/** The builder's public origin. Static pages are rendered at build time without env, so it falls back to devit.lol. */
export function appOrigin(): string {
  const u = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return u && /^https?:\/\//.test(u) ? u : DEFAULT_ORIGIN;
}

export const TAGLINE = "AI website builder for tokens and dApps";
export const DESCRIPTION =
  "devit builds a live website for a token or dApp from one sentence. Paste a contract address and the AI agent reads the chain, the token's socials and the team's posts on X, then writes a site with live price and charts, wallet connect, an in-page swap and buys from any chain through NEAR Intents and Relay. Publish to a free subdomain or your own domain, edit by clicking any block, export the code to GitHub.";

export const KEYWORDS = [
  "AI website builder", "memecoin website builder", "token website", "crypto website builder", "web3 website builder",
  "dApp landing page", "NEAR Intents", "NEAR AI", "Solana token website", "Base token website", "launch website for token",
  "buy with any chain", "no-code web3 site", "bolt.new alternative for crypto", "lovable alternative for web3",
];

export const FEATURES = [
  "One sentence (and an optional contract address) to a full site in under a minute",
  "Reads on-chain data: price, market cap, liquidity, holders, live trades, launchpad and pool",
  "Finds the token's logo, website and socials, and reads recent posts on X to match the team's voice",
  "Live chart, stats, holders and trades blocks that update on the published site",
  "Wallet connect for EVM (MetaMask, Rabby, WalletConnect), Solana (Phantom, Solflare, Backpack) and NEAR (HOT, Meteor, Intear)",
  "In-page swap: Jupiter on Solana, KyberSwap on EVM chains, Rhea on NEAR",
  "Buy from any chain with NEAR Intents 1Click (including private buys) or Relay; the buyer's own wallet signs",
  "Click any block in the preview, leave comments, and the agent changes only those blocks; every change can be undone",
  "Publish to <name>.devit.lol for free, or a custom domain on Pro; password or link-only sites",
  "Export the code as a Next.js app: push to a GitHub repo or download a zip",
  "Models: NEAR AI Cloud (private inference) by default, plus Claude, GPT and others with your own keys",
];

export const CHAINS_SUPPORTED = ["NEAR", "Solana", "Ethereum", "Base", "BNB Chain", "Robinhood Chain"];

export const FAQ: Array<{ q: string; a: string }> = [
  { q: "What is devit?", a: "devit is an AI website builder for crypto tokens and dApps. You describe the project in one sentence, optionally with a contract address, and it builds a live website with real chain data, wallet connect, a swap and buys from any chain. It runs at devit.lol." },
  { q: "How do I make a website for my memecoin?", a: "Open devit.lol, type a sentence about your token and paste its contract address. devit reads the chain, your socials and your posts on X, writes the site in your voice and shows it in a live preview. Click Publish to put it at yourname.devit.lol." },
  { q: "Which chains does it support?", a: `${CHAINS_SUPPORTED.join(", ")}. A site can show live data for a token on any of these and let visitors buy it from other chains through NEAR Intents or Relay.` },
  { q: "Can visitors buy my token from another chain?", a: "Yes. The buy box takes ETH, USDC, SOL, BNB, BTC and more from other chains. NEAR Intents 1Click and Relay route the swap and the token lands in the buyer's wallet. Buyers sign in their own wallet; devit never holds funds. NEAR Intents also offers private buys." },
  { q: "Is it free?", a: `Yes, the Free plan includes ${PLANS[0].credits} AI credits a day (about 3 site builds plus edits), unlimited use on your own model key and hosting on a devit.lol subdomain. Pro ($${PLANS[1].monthly}/month) adds ${PLANS[1].credits} credits a month, a custom domain, private projects and removes the footer credit. Team ($${PLANS[2].monthly}/month) adds 5 seats and shared projects.` },
  { q: "Can I edit the site after it's built?", a: "Yes. Click any block or element in the preview, leave comments, and the agent changes only those parts. You can also chat with it, switch styles, upload images, and undo any change." },
  { q: "Can I get the code?", a: "Yes. Export pushes a Next.js app to a new GitHub repo in your account, or downloads it as a zip. Live prices, trades and cross-chain buys keep working in the exported app." },
  { q: "Which AI models does it use?", a: "NEAR AI Cloud by default, which runs models in private hardware enclaves so launch plans stay private. You can switch to Claude, GPT, OpenRouter and others, with your own API keys if you like." },
  { q: "Does it use NEAR?", a: "Yes. NEAR AI Cloud writes the sites, NEAR Intents powers cross-chain and private buys, and NEAR tokens get live data, NEAR wallets and Rhea swaps. Payments for plans can be made with any token through NEAR Intents." },
];

// ——— published sites ———

/** The canonical URL a published site is served at. */
export function publishedUrl(p: Project, via: string | null, host: string | null): string {
  if (via === "custom" && host) return `https://${host}`;
  const d = sitesDomain();
  const slug = p.published?.slug ?? p.slug;
  return d ? `https://${slug}.${d}` : `${appOrigin()}/s/${slug}`;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function siteLinks(spec: SiteSpec): string[] {
  const all = [...(spec.links ?? []), ...(spec.token?.links ?? [])].map((l) => l.url).filter((u) => /^https:\/\//.test(u));
  return [...new Set(all)].slice(0, 12);
}

export function siteLogo(spec: SiteSpec): string | null {
  const l = spec.logo || spec.token?.logo || spec.x?.profile.avatar || null;
  return l && /^https:\/\//.test(l) ? l : null;
}

/** Cut to max chars at a sentence end if one is near, else at a word, with an ellipsis. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > max * 0.6) return cut.slice(0, stop + 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

export function siteDescription(spec: SiteSpec, max = 300): string {
  const lore = spec.blocks.find((b) => b.type === "story");
  const body = str(lore?.props.body);
  const base = spec.tagline || spec.token?.description || "";
  const d = [base, body && body !== base ? body : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return clip(d || `${spec.name} ($${spec.ticker}) on ${CHAINS[spec.chain].name}.`, max);
}

export function siteFaq(spec: SiteSpec): Array<{ q: string; a: string }> {
  return spec.blocks.filter((b) => b.type === "faq").flatMap((b) => list<{ q: string; a: string }>(b.props.items)).filter((f) => f?.q && f?.a);
}

export function siteSteps(spec: SiteSpec): Array<{ title: string; body: string }> {
  return spec.blocks.filter((b) => b.type === "how").flatMap((b) => list<{ title: string; body: string }>(b.props.steps)).filter((s) => s?.title);
}

/** JSON-LD for a published site: the website, the token it's about, and its FAQ and how-to-buy when it has them. */
export function siteJsonLd(spec: SiteSpec, url: string): object[] {
  const chain = CHAINS[spec.chain];
  const logo = siteLogo(spec);
  const links = siteLinks(spec);
  const t = spec.token;
  const out: object[] = [
    {
      "@context": "https://schema.org", "@type": "WebSite", name: `${spec.name} ($${spec.ticker})`, url, description: siteDescription(spec), inLanguage: "en",
      about: {
        "@type": "Thing", name: spec.name, alternateName: `$${spec.ticker}`, description: spec.tagline,
        ...(logo ? { image: logo } : {}),
        ...(links.length ? { sameAs: links } : {}),
        ...(t?.address && !t.demo ? { identifier: [{ "@type": "PropertyValue", propertyID: `${chain.name} contract address`, value: t.address }], url: `${chain.explorer}${t.address}` } : {}),
      },
    },
  ];
  const faq = siteFaq(spec);
  if (faq.length) out.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  const steps = siteSteps(spec);
  if (steps.length) out.push({ "@context": "https://schema.org", "@type": "HowTo", name: `How to buy $${spec.ticker}`, step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.body })) });
  return out;
}

/** A plain-text brief of a published site for AI assistants (served as /llms.txt on the site's host). */
export function siteLlmsTxt(spec: SiteSpec, url: string): string {
  const chain = CHAINS[spec.chain];
  const t = spec.token && !spec.token.demo ? spec.token : null;
  const lines = [`# ${spec.name} ($${spec.ticker})`, "", `> ${spec.tagline}`, "", siteDescription(spec), ""];
  lines.push("## Facts", `- Website: ${url}`, `- Chain: ${chain.name}`);
  if (t) {
    lines.push(`- Contract address: ${t.address}`, `- Explorer: ${chain.explorer}${t.address}`);
    if (t.pairUrl) lines.push(`- Chart: ${t.pairUrl}`);
  }
  const links = siteLinks(spec);
  if (links.length) lines.push("", "## Links", ...links.map((l) => `- ${l}`));
  const steps = siteSteps(spec);
  if (steps.length) lines.push("", `## How to buy $${spec.ticker}`, ...steps.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`));
  const faq = siteFaq(spec);
  if (faq.length) lines.push("", "## FAQ", ...faq.flatMap((f) => [`### ${f.q}`, f.a, ""]));
  for (const b of spec.blocks.filter((x) => x.type === "roadmap")) {
    const items = list<{ when: string; title: string; body: string }>(b.props.items);
    if (items.length) lines.push("", "## Roadmap", ...items.map((it) => `- ${it.when}: ${it.title}. ${it.body}`));
  }
  lines.push("", "---", `Live price, chart and trades are on the website. This site was made with ${BRAND} (${appOrigin()}). Nothing here is financial advice.`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

// ——— the builder ———

export function builderJsonLd(): object[] {
  const origin = appOrigin();
  return [
    { "@context": "https://schema.org", "@type": "Organization", "@id": `${origin}/#org`, name: BRAND, url: origin, logo: `${origin}/icon.svg`, description: DESCRIPTION },
    { "@context": "https://schema.org", "@type": "WebSite", "@id": `${origin}/#site`, name: BRAND, alternateName: "devit", url: origin, description: DESCRIPTION, publisher: { "@id": `${origin}/#org` }, inLanguage: "en" },
    {
      "@context": "https://schema.org", "@type": "SoftwareApplication", name: BRAND, url: origin, applicationCategory: "DeveloperApplication", applicationSubCategory: "Website builder",
      operatingSystem: "Web", description: DESCRIPTION, featureList: FEATURES, publisher: { "@id": `${origin}/#org` },
      offers: PLANS.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.monthly), priceCurrency: "USD", description: p.blurb, url: `${origin}/pricing` })),
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
}

export function builderLlmsTxt(full: boolean): string {
  const o = appOrigin();
  const lines = [
    `# ${BRAND}`, "", `> ${TAGLINE}. ${DESCRIPTION}`, "",
    "## Start here",
    `- [Build a site](${o}/): type one sentence about your token or dApp, optionally with its contract address`,
    `- [Pricing](${o}/pricing): Free, Pro and Team plans`,
    `- [Styles](${o}/#templates): example sites in each visual style`,
    `- [Privacy](${o}/privacy) and [Terms](${o}/terms)`,
    "", "## What it does", ...FEATURES.map((f) => `- ${f}`),
    "", "## Chains", `- ${CHAINS_SUPPORTED.join(", ")}`,
    "", "## Plans", ...PLANS.map((p) => `- ${p.name}: $${p.monthly}/month ($${p.yearly}/month yearly). ${p.perks.join("; ")}`),
    "", "## Published sites",
    `- Every published site lives at https://<name>.${sitesDomain() ?? "devit.lol"} and has its own /llms.txt and /sitemap.xml with the token's facts, links, how-to-buy steps and FAQ.`,
    `- Sitemap of public sites: ${o}/sitemap.xml`,
  ];
  if (full) lines.push("", "## FAQ", ...FAQ.flatMap((f) => [`### ${f.q}`, f.a, ""]));
  else lines.push("", "## Optional", `- [Full brief with FAQ](${o}/llms-full.txt)`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/** The IndexNow key (public by design: it's served at /indexnow.txt on every host we answer for). */
export const indexNowKey = () => process.env.INDEXNOW_KEY?.trim() || "c1d0a8f4e6b24a7f9e2b5d3c7a1f0e96";

/** Tell Bing, Yandex, Seznam and Naver (IndexNow) that these URLs changed. Fire and forget. */
export function pingIndexNow(urls: string[]): void {
  const byHost = new Map<string, string[]>();
  for (const u of urls) {
    try {
      const h = new URL(u).host;
      if (/^(localhost|127\.|\[::1\])/.test(h) || h.endsWith(".trycloudflare.com")) continue;
      byHost.set(h, [...(byHost.get(h) ?? []), u]);
    } catch { /* skip */ }
  }
  const key = indexNowKey();
  for (const [host, urlList] of byHost) {
    void fetch("https://api.indexnow.org/indexnow", {
      method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `https://${host}/indexnow.txt`, urlList }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined);
  }
}
