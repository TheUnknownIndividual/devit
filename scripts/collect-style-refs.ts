// Collects live token sites from DexScreener's public API into data/style-refs/index.json (style records and
// small thumbnails only). Run: pnpm style-refs [--limit 60] [--concurrency 3] [--keep 300]
import fs from "node:fs";
import path from "node:path";
import { readReference } from "../src/lib/reference";
import { STYLE_DIR, styleRefOf, type StyleRef } from "../src/lib/style-library";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) || d : d; };
const LIMIT = arg("limit", 60), CONC = Math.min(3, Math.max(1, arg("concurrency", 3))), KEEP = arg("keep", 300);
const CHAINS = /^(solana|ethereum|base|near|robinhood\w*)$/i;
// Link hubs, socials and builders are not a token's own site.
const SKIP_HOST = /(^|\.)(x\.com|twitter\.com|t\.me|telegram\.\w+|discord\.\w+|github\.com|linktr\.ee|linktree\.\w+|medium\.com|notion\.\w+|youtube\.com|tiktok\.com|instagram\.com|facebook\.com|reddit\.com|pump\.fun|dexscreener\.com|gitbook\.io|carrd\.co|wixsite\.com|netlify\.app|vercel\.app|pages\.dev|webflow\.io|github\.io|blogspot\.com|wordpress\.com|bio\.link|beacons\.ai|google\.com|spacex\.com|[^.]+\.gov|knowyourmeme\.com)$/i;
const PARKED = /domain (is )?(for sale|may be for sale)|buy this domain|parked (free|domain)|this domain (is|has)|sedo|dan\.com|hugedomains|afternic|godaddy|account suspended|site (can.t|cannot) be reached|coming soon|under construction|just a moment|attention required|404 not found|default web site|welcome to nginx|it works!/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = (h: string) => h.replace(/^www\./, "").split(".").slice(-2).join(".");

interface Cand { url: string; host: string; chain: string; token: string }

async function dex(url: string): Promise<unknown[]> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    return r.ok ? ((await r.json()) as unknown[]) : [];
  } catch { return []; }
}

type Row = { chainId?: string; tokenAddress?: string; links?: Array<{ type?: string; label?: string; url?: string }> };

/** Boosts carry no links: the token's pair info does (websites list). */
async function siteOf(chain: string, token: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${token}`, { signal: AbortSignal.timeout(12_000) });
    const pairs = r.ok ? ((await r.json()) as Array<{ info?: { websites?: Array<{ url?: string }> } }>) : [];
    return pairs.find((p) => p.info?.websites?.[0]?.url)?.info?.websites?.[0]?.url ?? null;
  } catch { return null; }
}

async function candidates(): Promise<Cand[]> {
  const rows: Row[] = [];
  for (const u of ["token-profiles/latest/v1", "token-boosts/top/v1", "token-boosts/latest/v1"]) { rows.push(...((await dex(`https://api.dexscreener.com/${u}`)) as Row[])); await sleep(1200); }
  const seen = new Set<string>(), out: Cand[] = [], tokens = new Set<string>();
  for (const p of rows) {
    if (!p.chainId || !CHAINS.test(p.chainId) || !p.tokenAddress || tokens.has(p.tokenAddress)) continue;
    tokens.add(p.tokenAddress);
    const l = p.links?.find((x) => /website/i.test(`${x.type} ${x.label}`) && x.url);
    const raw = l?.url ?? (await sleep(250), await siteOf(p.chainId, p.tokenAddress));
    if (!raw) continue;
    let u: URL;
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { continue; }
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (SKIP_HOST.test(host) || seen.has(host) || !host.includes(".")) continue;
    seen.add(host);
    out.push({ url: u.origin + "/", host, chain: p.chainId.toLowerCase(), token: p.tokenAddress });
  }
  return out;
}

/** Alive, not parked, and not redirecting somewhere else entirely. */
async function alive(c: Cand): Promise<boolean> {
  try {
    const r = await fetch(c.url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" } });
    if (r.status >= 400 && r.status !== 403) return false;
    if (root(new URL(r.url).hostname) !== root(c.host)) return false;
    const body = (await r.text()).slice(0, 60_000);
    const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (PARKED.test(`${body.match(/<title[^>]*>([^<]*)/i)?.[1] ?? ""} ${text.slice(0, 600)}`) && text.length < 2500) return false;
    return true;
  } catch { return false; }
}

async function main() {
  fs.mkdirSync(STYLE_DIR, { recursive: true });
  const indexPath = path.join(STYLE_DIR, "index.json");
  let have: StyleRef[] = [];
  try { have = JSON.parse(fs.readFileSync(indexPath, "utf8")); } catch { /* first run */ }
  const known = new Set(have.map((r) => r.host));
  const todo = (await candidates()).filter((c) => !known.has(c.host)).slice(0, LIMIT);
  console.log(`${todo.length} new candidate sites (${have.length} already in the library)`);
  const fresh: StyleRef[] = [];
  const skipped = { dead: 0, unreadable: 0 };
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const c = todo[i++];
      await sleep(400);
      if (!(await alive(c))) { skipped.dead++; continue; }
      const file = `${c.host.replace(/[^a-z0-9.-]/g, "_")}.jpg`;
      const r = await Promise.race([readReference(c.url, { shot: path.join(STYLE_DIR, file) }), sleep(60_000).then(() => null)]).catch(() => null);
      // Needs a real page: a browser read that found sections (a bare shell is a parked or broken site).
      if (!r || r.how !== "browser" || (r.pages[0]?.sections.length ?? 0) < 2 || (r.title && PARKED.test(r.title))) { skipped.unreadable++; fs.rmSync(path.join(STYLE_DIR, file), { force: true }); continue; }
      fresh.push(styleRefOf(r, c.chain, fs.existsSync(path.join(STYLE_DIR, file)) ? file : null));
      console.log(`  ${c.host} [${c.chain}] ${fresh[fresh.length - 1].tags.join("/")}`);
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  const all = [...fresh, ...have].sort((a, b) => b.at - a.at);
  const kept = all.slice(0, KEEP);
  for (const r of all.slice(KEEP)) if (r.shot) fs.rmSync(path.join(STYLE_DIR, r.shot), { force: true });
  fs.writeFileSync(indexPath, JSON.stringify(kept, null, 1));
  const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`added ${fresh.length}, skipped ${skipped.dead} dead/parked/redirected + ${skipped.unreadable} unreadable; library ${kept.length}`);
  console.log(`chains: ${count(kept.map((r) => r.chain))}`);
  console.log(`primary tags: ${count(kept.map((r) => r.tags[0] ?? "none"))}`);
  console.log(`dark: ${count(kept.map((r) => String(r.palette.dark)))} | hero: ${count(kept.map((r) => r.layout.hero))} | density: ${count(kept.map((r) => r.layout.density))} | ticker ${kept.filter((r) => r.layout.ticker).length}`);
}
main().then(() => process.exit(0));
