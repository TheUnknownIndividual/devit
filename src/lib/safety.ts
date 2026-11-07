import type { Project, SiteSpec } from "./spec";
import { findLeaks } from "./leaks";

// The check Publish runs before a site goes live (like Lovable's security scan, made for token sites): the things that
// get a memecoin site reported, scammed through, or simply break a buy. Read from the spec only; nothing is fetched.

/** `blocks`: publishing is refused while this is on the page (a secret would go public). */
export type Finding = { level: "high" | "warn" | "info"; title: string; detail: string; blockId?: string; blocks?: true };

const EVM = /\b0x[a-fA-F0-9]{40}\b/g;
const SOL = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s"'<>)]+/gi;

/** Wording that drainers use, and promises that read as financial advice. */
const DRAINER = /\b(seed|recovery|secret|mnemonic) (phrase|words?)\b|\bprivate key\b|\bvalidate (your )?wallet\b|\bsync (your )?wallet\b|\bwallet (validation|rectification)\b|\bclaim (your )?airdrop now\b/i;
const PROMISE = /\bguaranteed? (returns?|profits?|gains?|100x|10x)\b|\brisk[- ]free\b|\bcan(?:'|no)t lose\b|\bwill (definitely |surely )?(go up|moon|100x|10x)\b/i;
/** Hosts a token site normally links to; anything else is shown, not judged. */
const USUAL = /(^|\.)(x\.com|twitter\.com|t\.me|telegram\.(me|org)|discord\.(gg|com)|github\.com|medium\.com|youtube\.com|dexscreener\.com|geckoterminal\.com|coingecko\.com|coinmarketcap\.com|birdeye\.so|pump\.fun|jup\.ag|raydium\.io|uniswap\.org|app\.uniswap\.org|aerodrome\.finance|pancakeswap\.finance|ref\.finance|rhea\.finance|app\.rhea\.finance|nearblocks\.io|solscan\.io|etherscan\.io|basescan\.org|bscscan\.com|blockscout\.com|robinhoodchain\.blockscout\.com|four\.meme|meteora\.ag|neartrade\.lol|near\.org|solana\.com|base\.org|devit\.lol|linktr\.ee|warpcast\.com|farcaster\.xyz|instagram\.com|tiktok\.com|reddit\.com)$/i;
/** Two hosts that look alike but aren't the same (dexscreener vs dexscreemer): what phishing links do. */
function lookalike(host: string): string | null {
  const known = ["dexscreener.com", "pump.fun", "jup.ag", "raydium.io", "uniswap.org", "pancakeswap.finance", "t.me", "x.com", "twitter.com", "telegram.org", "coingecko.com", "etherscan.io", "solscan.io", "nearblocks.io", "meteora.ag"];
  const h = host.replace(/^www\./, "");
  for (const k of known) {
    if (h === k || h.endsWith(`.${k}`)) return null;
    const a = h.split(".")[0], b = k.split(".")[0];
    if (a.length >= 4 && a !== b && dist(a, b) <= 2 && Math.abs(a.length - b.length) <= 2) return k;
  }
  return null;
}
function dist(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Every string in a block's props, with the key it sits under. */
function strings(v: unknown, key = "", out: Array<{ key: string; s: string }> = []): Array<{ key: string; s: string }> {
  if (typeof v === "string") out.push({ key, s: v });
  else if (Array.isArray(v)) v.forEach((x) => strings(x, key, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, k, out);
  return out;
}

const LABEL: Record<string, string> = { hero: "Hero", buy: "Buy box", how: "How to buy", tokenomics: "Tokenomics", faq: "FAQ", story: "Story", roadmap: "Roadmap", socials: "Socials", footer: "Footer", nav: "Top bar", raid: "Raid kit", signup: "Signup form" };

export function checkSite(p: Project): { findings: Finding[]; checked: number } {
  const spec = p.spec as SiteSpec | null;
  if (!spec) return { findings: [], checked: 0 };
  const out: Finding[] = [];
  const ca = spec.token?.address ?? null;
  const caLow = ca?.toLowerCase();
  const seenOther = new Set<string>();
  const hosts = new Map<string, string | undefined>();
  let checked = 0;

  const scan = (s: string, where: string, blockId?: string) => {
    checked++;
    // Sentence by sentence, leaving out questions and denials: "we'll never ask for your seed phrase" and "Are there
    // guaranteed returns? No." are the good kind.
    const claims = s.split(/(?<=[.!?\n])\s+/).filter((x) => !x.includes("?") && !/\b(no|not|never|nobody|nothing|isn'?t|aren'?t|don'?t|doesn'?t|won'?t|zero)\b/i.test(x)).join(" ");
    if (DRAINER.test(claims)) out.push({ level: "high", title: `${where} asks for wallet secrets`, detail: "Words like \"seed phrase\", \"private key\" or \"validate your wallet\" are what wallet drainers use. Real projects never ask for them; wallets and sites flag pages that do.", blockId });
    if (PROMISE.test(claims)) out.push({ level: "warn", title: `${where} promises returns`, detail: "\"Guaranteed\", \"risk-free\" or \"will 100x\" reads as a promise of profit. It gets sites reported and can break the law where you or your buyers live.", blockId });
    // Another contract address than the token's: a pasted wrong CA is the most common way buyers lose money.
    if (ca) {
      for (const m of s.matchAll(spec.chain === "solana" ? SOL : EVM)) {
        const a = m[0];
        if (a.toLowerCase() === caLow || seenOther.has(a)) continue;
        if (spec.chain === "solana" && !/\d/.test(a)) continue; // a long word, not an address
        seenOther.add(a);
        out.push({ level: "warn", title: `${where} shows another address`, detail: `${a.slice(0, 6)}…${a.slice(-4)} isn't this token's contract (${ca.slice(0, 6)}…${ca.slice(-4)}). If it's a wallet or a pool that's fine; if it's meant to be the CA, fix it before buyers copy it.`, blockId });
      }
    }
    for (const m of s.matchAll(URL_RE)) {
      let u: URL;
      try { u = new URL(m[0]); } catch { continue; }
      if (u.protocol === "http:") out.push({ level: "warn", title: `${where} links over http`, detail: `${u.host} is linked without https; browsers warn on it and it can be tampered with.`, blockId });
      const look = lookalike(u.hostname);
      if (look) out.push({ level: "high", title: `${where} links to a lookalike of ${look}`, detail: `${u.hostname} looks like ${look} but isn't. Phishing sites use names like this.`, blockId });
      if (!hosts.has(u.hostname)) hosts.set(u.hostname, blockId);
    }
  };

  // Secrets first, in every string the page carries (image and link URLs too): these stop a publish.
  const leak = (s: string, where: string, blockId?: string) => {
    for (const kind of new Set(findLeaks(s).map((l) => l.kind))) out.push({ level: "high", blocks: true, title: `${where} has ${kind} in it`, detail: "Anyone who opens the site could copy it. Ask the chat to take it out (and revoke it where it was issued, since it's been pasted). Publishing waits until it's gone.", blockId });
  };
  leak(`${spec.name} ${spec.tagline}`, "The site name");
  for (const b of spec.blocks) for (const { s } of strings(b.props)) leak(s, LABEL[b.type] ?? b.type, b.id);
  for (const l of spec.links ?? []) leak(l.url, "Your links");

  scan(`${spec.name} ${spec.tagline}`, "The site name");
  for (const b of spec.blocks) for (const { key, s } of strings(b.props)) if (!/^(id|type|color|icon|image|src)$/i.test(key)) scan(s, LABEL[b.type] ?? b.type, b.id);
  for (const l of spec.links ?? []) scan(l.url, "Your links");

  const odd = [...hosts.keys()].filter((h) => !USUAL.test(h) && !lookalike(h));
  if (odd.length) out.push({ level: "info", title: `Links to ${odd.length} other site${odd.length === 1 ? "" : "s"}`, detail: `${odd.slice(0, 6).join(", ")}${odd.length > 6 ? "…" : ""}. Check each one is yours or one you trust.` });

  const types = new Set(spec.blocks.map((b) => b.type));
  if (spec.token && !types.has("buy") && !types.has("how")) out.push({ level: "info", title: "No way to buy on the page", detail: "There's no buy box or How to buy section, so visitors have to find the token themselves. Ask for one in the chat." });
  if (!spec.token && (types.has("buy") || types.has("chart") || types.has("trades"))) out.push({ level: "info", title: "No contract address yet", detail: "The buy box, chart and trades stay empty until there is one. Paste it in the chat once the token is live and they fill in." });
  if (!(spec.links ?? []).length && !spec.token?.links.length) out.push({ level: "info", title: "No socials linked", detail: "Buyers look for an X account or a Telegram before they buy. Paste your links in the chat." });

  // One line per problem: the same finding in several blocks is said once.
  const seen = new Set<string>();
  const findings = out.filter((f) => { const k = `${f.level}|${f.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const rank = { high: 0, warn: 1, info: 2 } as const;
  findings.sort((a, b) => rank[a.level] - rank[b.level]);
  return { findings, checked };
}
