import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isPublicHttps } from "./net";
import { logoAccent, themeColorOf } from "./palette";
import { metadataAddress, parseMetadata } from "./solana";
import { BLOCKSCOUT, DEFAULT_RPC, rpcFor } from "./chain";
import { isVenueHost } from "./venues";
import type { Chain, Finding, Research, SocialInput, TokenInfo, Voice, XPost, XProfile } from "./spec";

// Before writing a word, find out who the project is: socials and story from DexScreener, CoinGecko,
// the token's own metadata (IPFS on Solana, the reference on NEAR, the verified source on EVM),
// the team's website and their recent posts on X. Every finding keeps where it came from.

const TIMEOUT_MS = 8000;
const UA = "sitesmith/0.1 (+https://github.com/sitesmith)";

async function fetchText(raw: string, max = 1_500_000, accept = "text/html,application/json"): Promise<{ text: string; url: string } | null> {
  let url = raw;
  // Follow redirects by hand so each hop is checked against internal addresses.
  for (let hop = 0; hop < 4; hop++) {
    if (!isPublicHttps(url)) return null;
    let r: Response;
    try {
      r = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      return null;
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) return null;
      url = new URL(loc, url).toString();
      continue;
    }
    if (!r.ok || !r.body) return null;
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
      if (size > max) { void reader.cancel().catch(() => undefined); break; }
    }
    return { text: Buffer.concat(chunks).toString("utf8"), url };
  }
  return null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, headers: { "user-agent": UA, accept: "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function rpc<T>(url: string, method: string, params: unknown): Promise<T | null> {
  const r = await fetchJson<{ result?: T }>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r?.result ?? null;
}

/** ipfs:// and bare CIDs through a public gateway. */
export function gateway(u: string): string {
  const s = u.trim();
  if (s.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${s.slice(7).replace(/^ipfs\//, "")}`;
  if (s.startsWith("ar://")) return `https://arweave.net/${s.slice(5)}`;
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})/.test(s)) return `https://ipfs.io/ipfs/${s}`;
  return s;
}

/** Metadata JSON from IPFS: public gateways are slow and rate-limited, so ask three at once and keep the first answer. */
async function fetchMetaJson(uri: string): Promise<MetaJson | null> {
  const url = gateway(uri);
  const cid = url.match(/\/ipfs\/(.+)$/)?.[1] ?? url.match(/^https:\/\/([a-z0-9]+)\.ipfs\.[^/]+\/?(.*)$/)?.slice(1).join("/");
  const tries = cid ? [`https://ipfs.io/ipfs/${cid}`, `https://gateway.pinata.cloud/ipfs/${cid}`, `https://w3s.link/ipfs/${cid}`] : [url];
  const one = async (u: string) => {
    const r = await fetchText(u, 200_000, "application/json");
    if (!r) throw new Error("no answer");
    return JSON.parse(r.text) as MetaJson;
  };
  try { return await Promise.any(tries.map(one)); } catch { return null; }
}

// ---------- links ----------

const RESERVED_X = new Set(["i", "home", "intent", "search", "share", "hashtag", "explore", "settings", "messages", "notifications"]);

export function xHandle(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
  const h = m ? m[1] : s.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h) || RESERVED_X.has(h.toLowerCase())) return null;
  return h;
}

function kindOf(url: string): string {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (/^(x|twitter)\.com$/.test(h)) return "x";
  if (/^(t\.me|telegram\.me)$/.test(h)) return "telegram";
  if (/^(discord\.gg|discord\.com)$/.test(h)) return "discord";
  if (h === "github.com") return "github";
  if (/(^|\.)medium\.com$/.test(h)) return "medium";
  if (h === "tiktok.com") return "tiktok";
  if (h === "instagram.com") return "instagram";
  if (/^(youtube\.com|youtu\.be)$/.test(h)) return "youtube";
  if (h === "reddit.com") return "reddit";
  if (/(^|\.)(dexscreener|pump\.fun|coingecko|coinmarketcap|birdeye|solscan|etherscan|nearblocks|jup\.ag|dextools|geckoterminal|raydium|uniswap)\b/.test(h)) return "market";
  return "website";
}

const LABEL: Record<string, string> = { x: "X", telegram: "Telegram", discord: "Discord", github: "GitHub", medium: "Medium", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", reddit: "Reddit", website: "Website" };

/** Tidy what a person typed into a link we can show: "@bonk" → x.com/bonk, "t.me/x" → https://t.me/x. */
export function normalizeSocial(type: keyof SocialInput, raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  if (type === "x") { const h = xHandle(s); return h ? `https://x.com/${h}` : null; }
  if (type === "telegram") {
    const h = s.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_+/]{3,64})/i)?.[1] ?? s.replace(/^@/, "");
    return /^[A-Za-z0-9_+/]{3,64}$/.test(h) ? `https://t.me/${h}` : null;
  }
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    if (!u.hostname.includes(".")) return null;
    if (type === "discord" && !/discord\.(gg|com)$/.test(u.hostname.replace(/^www\./, ""))) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

class Links {
  items: Finding[] = [];
  add(url: string | null | undefined, source: string, typeHint?: string) {
    if (!url || typeof url !== "string") return;
    let u = gateway(url.trim());
    if (/^(t\.me|x\.com|twitter\.com|discord\.gg)\//i.test(u)) u = `https://${u}`;
    if (!/^https?:\/\//i.test(u)) {
      if (typeHint === "x") { const h = xHandle(u); if (!h) return; u = `https://x.com/${h}`; }
      else if (typeHint === "telegram") u = `https://t.me/${u.replace(/^@/, "")}`;
      else if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(u)) u = `https://${u}`;
      else return;
    }
    let type = kindOf(u);
    if (type === "market") return;
    if (type === "x") {
      const h = xHandle(u);
      // A link to one post or a community still names nothing we can read; keep it only as a link.
      if (h) u = `https://x.com/${h}`;
      else if (!/\/i\/communities\//.test(u)) return;
      else type = "x-community";
    }
    const key = u.toLowerCase().replace(/\/$/, "").replace("twitter.com", "x.com").replace("://www.", "://");
    if (this.items.some((f) => f.url.toLowerCase().replace(/\/$/, "").replace("://www.", "://") === key)) return;
    // One of each kind is enough; the first source to name it wins.
    if (this.items.some((f) => f.type === type)) return;
    this.items.push({ type, label: type === "x-community" ? "X Community" : LABEL[type] ?? "Link", url: u, source });
  }
  first(type: string) { return this.items.find((f) => f.type === type) ?? null; }
}

// ---------- sources ----------

const GECKO_PLATFORM: Partial<Record<Chain, string>> = { solana: "solana", ethereum: "ethereum", base: "base", bsc: "binance-smart-chain", near: "near-protocol" };

async function coingecko(t: TokenInfo, links: Links, descriptions: Research["descriptions"]): Promise<boolean> {
  const platform = GECKO_PLATFORM[t.chain];
  if (!platform) return false;
  const d = await fetchJson<{
    description?: { en?: string };
    links?: { homepage?: string[]; twitter_screen_name?: string; telegram_channel_identifier?: string; chat_url?: string[]; repos_url?: { github?: string[] } };
  }>(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${encodeURIComponent(t.address)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`);
  if (!d) return false;
  const l = d.links ?? {};
  if (l.twitter_screen_name) links.add(`https://x.com/${l.twitter_screen_name}`, "CoinGecko");
  if (l.telegram_channel_identifier) links.add(`https://t.me/${l.telegram_channel_identifier}`, "CoinGecko");
  for (const h of l.homepage ?? []) links.add(h, "CoinGecko");
  for (const c of l.chat_url ?? []) links.add(c, "CoinGecko");
  for (const g of l.repos_url?.github ?? []) links.add(g, "CoinGecko");
  const desc = d.description?.en?.replace(/<[^>]+>/g, "").trim();
  if (desc) descriptions.push({ text: desc, source: "CoinGecko" });
  return true;
}

type MetaJson = Record<string, unknown> & { description?: string; extensions?: Record<string, unknown> };

function readMetaJson(j: MetaJson | null, source: string, links: Links, descriptions: Research["descriptions"]): boolean {
  if (!j || typeof j !== "object") return false;
  const ext = (typeof j.extensions === "object" && j.extensions) || {};
  for (const [k, v] of Object.entries({ ...j, ...ext })) {
    if (typeof v !== "string") continue;
    if (/^(twitter|x)$/i.test(k)) links.add(v, source, "x");
    else if (/^telegram$/i.test(k)) links.add(v, source, "telegram");
    else if (/^(website|external_url|homepage|discord|github|medium)$/i.test(k)) links.add(v, source);
  }
  if (Array.isArray(j.links)) for (const l of j.links) if (typeof l === "string") links.add(l, source);
  if (typeof j.description === "string" && j.description.trim()) descriptions.push({ text: j.description.trim(), source });
  return true;
}

async function solanaMetadata(t: TokenInfo, links: Links, descriptions: Research["descriptions"]): Promise<string | null> {
  const rpcUrl = rpcFor("solana");
  let uri: string | null = null;
  const pda = metadataAddress(t.address);
  if (pda) {
    const acc = await rpc<{ value?: { data?: [string, string] } }>(rpcUrl, "getAccountInfo", [pda, { encoding: "base64" }]);
    const b64 = acc?.value?.data?.[0];
    if (b64) uri = parseMetadata(new Uint8Array(Buffer.from(b64, "base64")))?.uri || null;
  }
  if (!uri) {
    // Token-2022 mints carry their metadata inside the mint account.
    const acc = await rpc<{ value?: { data?: { parsed?: { info?: { extensions?: Array<{ extension: string; state?: { uri?: string } }> } } } } }>(rpcUrl, "getAccountInfo", [t.address, { encoding: "jsonParsed" }]);
    uri = acc?.value?.data?.parsed?.info?.extensions?.find((e) => e.extension === "tokenMetadata")?.state?.uri ?? null;
  }
  if (!uri) return null;
  const src = /ipfs/.test(uri) ? "token metadata (IPFS)" : /arweave|ar:\/\//.test(uri) ? "token metadata (Arweave)" : "token metadata";
  return readMetaJson(await fetchMetaJson(uri), src, links, descriptions) ? src : null;
}

async function nearMetadata(t: TokenInfo, links: Links, descriptions: Research["descriptions"]): Promise<string | null> {
  const r = await rpc<{ result?: number[] }>(rpcFor("near"), "query", { request_type: "call_function", finality: "final", account_id: t.address, method_name: "ft_metadata", args_base64: "e30=" });
  if (!r?.result) return null;
  let meta: { reference?: string | null } | null = null;
  try { meta = JSON.parse(Buffer.from(r.result).toString("utf8")); } catch { return null; }
  const ref = meta?.reference;
  if (!ref) return null;
  return readMetaJson(await fetchMetaJson(ref), "ft_metadata reference", links, descriptions) ? "ft_metadata reference" : null;
}

// Links in verified source that belong to libraries and tooling, not the project.
const SOURCE_NOISE = /(openzeppelin|hardhat|solidity|soliditylang|ethereum\.org|eips\.ethereum|github\.com\/(ethereum|OpenZeppelin|Uniswap|transmissions11|Vectorized|smartcontractkit)|consensys|zeppelin|uniswap\.org|docs\.|wikipedia|stackexchange|eth\.wiki|w3\.org|apache\.org|opensource\.org|spdx\.org|blockscout|etherscan|chainlink)/i;

async function evmSource(t: TokenInfo, links: Links): Promise<string | null> {
  const base = BLOCKSCOUT[t.chain];
  if (!base) return null;
  const d = await fetchJson<{ source_code?: string; additional_sources?: Array<{ source_code?: string }> }>(`${base}/api/v2/smart-contracts/${t.address}`);
  const src = [d?.source_code ?? "", ...(d?.additional_sources ?? []).map((x) => x.source_code ?? "")].join("\n");
  if (!src) return null;
  // Teams often put their links in the header comment of the token contract.
  const found = src.match(/(https?:\/\/[^\s"'<>)\]\\]+|\bt\.me\/[A-Za-z0-9_]+|\b(?:x|twitter)\.com\/[A-Za-z0-9_]+)/g) ?? [];
  let n = 0;
  for (const raw of found) {
    const u = raw.replace(/[.,;]+$/, "");
    if (SOURCE_NOISE.test(u)) continue;
    links.add(u, "contract source");
    n++;
  }
  return n ? "contract source" : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? decodeEntities(c).trim() || null : null;
}

async function website(url: string, links: Links, descriptions: Research["descriptions"]): Promise<Research["website"]> {
  const res = await fetchText(url, 1_500_000, "text/html");
  if (!res) return null;
  const html = res.text;
  const title = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() || null;
  const description = meta(html, "description") ?? meta(html, "og:description");
  let image = meta(html, "og:image") ?? meta(html, "twitter:image");
  if (image) { try { image = new URL(image, res.url).toString(); } catch { image = null; } }
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const h = m[1];
    if (/(x\.com|twitter\.com|t\.me|telegram\.me|discord\.gg|discord\.com\/invite|github\.com|medium\.com|tiktok\.com|instagram\.com|youtube\.com)/i.test(h)) links.add(h, "website");
  }
  // Readable text, for the story: drop scripts, styles and tags.
  const body = html.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  const excerpt = decodeEntities(body).replace(/\s+/g, " ").trim().slice(0, 1800) || null;
  if (description) descriptions.push({ text: description, source: "website" });
  return { url: res.url, title, description, image, excerpt, themeColor: themeColorOf(html) };
}

// ---------- X ----------

interface SynTweet {
  id_str: string;
  full_text?: string;
  text?: string;
  created_at: string;
  favorite_count?: number;
  retweet_count?: number;
  in_reply_to_screen_name?: string | null;
  entities?: { urls?: Array<{ url: string; expanded_url?: string; display_url?: string }>; media?: Array<{ url: string }> };
  extended_entities?: { media?: Array<{ media_url_https?: string; type?: string }> };
  user?: { screen_name: string; name: string; description?: string; followers_count?: number; profile_image_url_https?: string; profile_banner_url?: string; entities?: { url?: { urls?: Array<{ expanded_url?: string }> }; description?: { urls?: Array<{ expanded_url?: string }> } } };
  retweeted_status?: unknown;
}

type XRead = { profile: XProfile; posts: XPost[]; links: string[]; via: string };

/** A public X account and its recent posts, from X's own embed timeline. No key needed. */
async function syndication(handle: string): Promise<XRead | null> {
  const res = await fetchText(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`, 3_000_000, "text/html");
  const raw = res?.text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!raw) return null;
  let entries: Array<{ type?: string; content?: { tweet?: SynTweet } }> = [];
  try { entries = JSON.parse(raw)?.props?.pageProps?.timeline?.entries ?? []; } catch { return null; }
  const tweets = entries.map((e) => e.content?.tweet).filter((t): t is SynTweet => !!t?.id_str);
  const own = tweets.filter((t) => t.user?.screen_name?.toLowerCase() === handle.toLowerCase());
  const u = own[0]?.user ?? tweets[0]?.user;
  if (!u) return null;
  const profile: XProfile = {
    handle: u.screen_name,
    name: u.name,
    bio: decodeEntities(u.description ?? ""),
    followers: typeof u.followers_count === "number" ? u.followers_count : null,
    avatar: u.profile_image_url_https?.replace("_normal.", "_400x400.") ?? null,
    banner: u.profile_banner_url ? `${u.profile_banner_url}/1500x500` : null,
  };
  const textOf = (t: SynTweet) => {
    let s = t.full_text ?? t.text ?? "";
    for (const m of t.entities?.media ?? []) s = s.replace(m.url, "");
    for (const l of t.entities?.urls ?? []) s = s.replace(l.url, l.display_url ?? l.expanded_url ?? "");
    return decodeEntities(s).trim();
  };
  const originals = own.filter((t) => !t.retweeted_status && !/^RT @/.test(t.full_text ?? t.text ?? "") && !t.in_reply_to_screen_name);
  const posts: XPost[] = originals
    .map((t) => ({
      id: t.id_str,
      text: textOf(t),
      at: Date.parse(t.created_at) || 0,
      likes: t.favorite_count ?? 0,
      reposts: t.retweet_count ?? 0,
      url: `https://x.com/${u.screen_name}/status/${t.id_str}`,
      image: t.extended_entities?.media?.find((m) => m.type === "photo")?.media_url_https ?? null,
    }))
    .filter((p) => p.text.length > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 20);
  const links = [...(u.entities?.url?.urls ?? []), ...(u.entities?.description?.urls ?? [])].map((x) => x.expanded_url).filter((x): x is string => !!x);
  return { profile, posts, links, via: "X" };
}

interface ApiTweet {
  id?: string; text?: string; createdAt?: string; isReply?: boolean; likeCount?: number; retweetCount?: number; retweeted_tweet?: unknown;
  author?: { userName?: string; name?: string; description?: string; profilePicture?: string; coverPicture?: string; followers?: number };
  entities?: { urls?: Array<{ url?: string; expanded_url?: string; display_url?: string }> };
  extendedEntities?: { media?: Array<{ url?: string; media_url_https?: string; type?: string }> };
}

/** The same X provider neartrade reads (twitterapi.io): one call for an account's latest posts. Needs TWITTERAPI_IO_KEY. */
async function twitterApi(handle: string): Promise<XRead | null> {
  const key = (process.env.TWITTERAPI_IO_KEY ?? "").trim();
  if (!key) return null;
  const body = await fetchJson<{ status?: string; tweets?: ApiTweet[]; data?: { tweets?: ApiTweet[] } }>(
    `https://api.twitterapi.io/twitter/user/last_tweets?${new URLSearchParams({ userName: handle, includeReplies: "false" })}`,
    { headers: { "X-API-Key": key } },
  );
  const list = body?.tweets ?? body?.data?.tweets;
  if (!Array.isArray(list) || !list.length) return null;
  const own = list.filter((t) => t.author?.userName?.toLowerCase() === handle.toLowerCase());
  const a = own[0]?.author;
  if (!a?.userName) return null;
  const textOf = (t: ApiTweet) => {
    let s = t.text ?? "";
    for (const m of t.extendedEntities?.media ?? []) if (m.url) s = s.replace(m.url, "");
    for (const l of t.entities?.urls ?? []) if (l.url) s = s.replace(l.url, l.display_url ?? l.expanded_url ?? "");
    return decodeEntities(s).trim();
  };
  const posts: XPost[] = own
    .filter((t) => t.id && !t.isReply && !t.retweeted_tweet && !/^RT @/.test(t.text ?? ""))
    .map((t) => ({
      id: t.id!,
      text: textOf(t),
      at: Date.parse(t.createdAt ?? "") || 0,
      likes: t.likeCount ?? 0,
      reposts: t.retweetCount ?? 0,
      url: `https://x.com/${a.userName}/status/${t.id}`,
      image: t.extendedEntities?.media?.find((m) => m.type === "photo")?.media_url_https ?? null,
    }))
    .filter((p) => p.text.length > 0)
    .sort((x, y) => y.at - x.at)
    .slice(0, 20);
  return {
    profile: { handle: a.userName, name: a.name ?? a.userName, bio: a.description ?? "", followers: a.followers ?? null, avatar: a.profilePicture?.replace("_normal.", "_400x400.") ?? null, banner: a.coverPicture ?? null },
    posts,
    links: [],
    via: "X",
  };
}

/** Profile only (bio, avatar, followers) from a public X mirror, for when the timeline is rate-limited. */
async function profileOnly(handle: string): Promise<XRead | null> {
  const fx = await fetchJson<{ user?: { screen_name: string; name: string; description?: string; followers?: number; avatar_url?: string; banner_url?: string; website?: { url?: string } | null } }>(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(handle)}`);
  if (fx?.user?.screen_name) {
    const u = fx.user;
    return { profile: { handle: u.screen_name, name: u.name, bio: u.description ?? "", followers: u.followers ?? null, avatar: u.avatar_url?.replace("_normal.", "_400x400.") ?? null, banner: u.banner_url ?? null }, posts: [], links: u.website?.url ? [u.website.url] : [], via: "X profile" };
  }
  const vx = await fetchJson<{ screen_name?: string; name?: string; description?: string; followers_count?: number; profile_image_url?: string }>(`https://api.vxtwitter.com/${encodeURIComponent(handle)}`);
  if (vx?.screen_name) {
    return { profile: { handle: vx.screen_name, name: vx.name ?? vx.screen_name, bio: vx.description ?? "", followers: vx.followers_count ?? null, avatar: vx.profile_image_url?.replace("_normal.", "_400x400.") ?? null, banner: null }, posts: [], links: [], via: "X profile" };
  }
  return null;
}

// X rate-limits its public timeline per IP, so reads are kept on disk for a few hours.
const X_DIR = path.join(process.cwd(), "data", "x");
const X_FRESH_MS = 6 * 3600_000;

export async function readX(handle: string): Promise<XRead | null> {
  const h = handle.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(h)) return null;
  const f = path.join(X_DIR, `${h}.json`);
  let cached: (XRead & { at: number }) | null = null;
  try { cached = JSON.parse(await readFile(f, "utf8")); } catch { cached = null; }
  if (cached && cached.posts.length && Date.now() - cached.at < X_FRESH_MS) return cached;
  const live = (await twitterApi(handle).catch(() => null)) ?? (await syndication(handle));
  if (live) {
    // The API's author object may lack the bio; the free profile mirror fills it in.
    if (!live.profile.bio) {
      const p = await profileOnly(handle).catch(() => null);
      if (p) live.profile = { ...p.profile, ...Object.fromEntries(Object.entries(live.profile).filter(([, v]) => v)) } as XProfile;
    }
    await mkdir(X_DIR, { recursive: true }).catch(() => undefined);
    await writeFile(f, JSON.stringify({ ...live, at: Date.now() })).catch(() => undefined);
    return live;
  }
  // Older posts beat no posts.
  if (cached?.posts.length) return cached;
  if (cached && Date.now() - cached.at < 3600_000) return cached;
  const prof = await profileOnly(handle);
  if (prof) {
    await mkdir(X_DIR, { recursive: true }).catch(() => undefined);
    await writeFile(f, JSON.stringify({ ...prof, at: Date.now() })).catch(() => undefined);
  }
  return prof ?? cached;
}

const STOP = new Set("the and for with that this you your are our from have has was were will just they them their what when then than into out about more like been only also its it's can not but all get got one now new who how why here there over some any very much each most".split(" "));

/** How the account writes: shouting or lowercase, emoji habits, a signature, hashtags and pet words. */
export function voiceOf(posts: XPost[]): Voice {
  const texts = posts.map((p) => p.text.replace(/https?:\/\/\S+|\b[\w.-]+\.(com|io|xyz|fun|gg|me|app)\/\S*/g, "").trim()).filter(Boolean);
  const letters = texts.join(" ").replace(/[^A-Za-z]/g, "");
  const caps = letters.length ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  const lowercase = texts.length ? texts.filter((t) => /[a-z]/.test(t) && !/[A-Z]/.test(t)).length / texts.length : 0;
  const exclaim = texts.length ? texts.reduce((n, t) => n + (t.match(/!/g)?.length ?? 0), 0) / texts.length : 0;
  const count = (re: RegExp) => {
    const m = new Map<string, number>();
    for (const t of texts) for (const x of new Set(t.match(re) ?? [])) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const emojis = count(/\p{Extended_Pictographic}️?/gu).slice(0, 5).map(([e]) => e);
  const sig = count(/(\p{Extended_Pictographic}️?)\1{1,}|!{3,}/gu)[0];
  const tags = count(/[#$][A-Za-z][A-Za-z0-9_]{1,20}/g).slice(0, 6).map(([t]) => t);
  const words = count(/\b[a-zA-Z]{4,}\b/g)
    .map(([w, n]) => [w.toLowerCase(), n] as const)
    .filter(([w, n]) => !STOP.has(w) && n >= 2)
    .slice(0, 8)
    .map(([w]) => w);
  const avgLen = texts.length ? Math.round(texts.reduce((n, t) => n + t.length, 0) / texts.length) : 0;
  const notes: string[] = [];
  if (caps > 0.5) notes.push("writes in capitals");
  else if (lowercase > 0.6) notes.push("writes in lowercase");
  if (exclaim > 1) notes.push("lots of exclamation marks");
  if (sig) notes.push(`signs off with ${sig[0]}`);
  if (avgLen && avgLen < 70) notes.push("short posts");
  if (emojis.length) notes.push(`likes ${emojis.slice(0, 3).join(" ")}`);
  return { caps: Math.round(caps * 100) / 100, lowercase: Math.round(lowercase * 100) / 100, exclaim: Math.round(exclaim * 10) / 10, emojis, signature: sig?.[0] ?? null, tags, words, avgLen, notes };
}

// ---------- story ----------

const UTILITY = /\b(stak(e|ing)|apps?|platform|protocol|game|gaming|AI agents?|agents|swaps?|bridge|dao|governance|launchpad|wallet|payments?|marketplace|tools?|bot|yield|rewards?|nfts?|lottery|burns?|buybacks?|revenue)\b/i;

const NOT_UTILITY = /\b(not financial advice|no utility|no intrinsic value)\b/i;
// How-to-buy steps mention wallets and swaps without being something the token does.
const HOW_TO = /^(you('ll)? (need|will need|can)|to (buy|get|purchase)|first,?|then,?|next,?|step \d|connect (your|a)|download|install|create (a|your) wallet|send|go to|head to|paste|click|open)\b|\b(to store (your|it)|wallets? to (store|buy|send|hold|keep)|your wallet address|how to buy)\b/i;

/** Real sentences only: menus and button rows scraped from a site read as runs of Capitalised Words. */
function prose(s: string): boolean {
  const words = s.split(/\s+/);
  if (words.length < 6) return false;
  const capped = words.filter((w) => /^[A-Z]/.test(w)).length / words.length;
  return capped < 0.45 && !/skip to content|copyright|all rights reserved|cookie/i.test(s) && !/[1-9A-HJ-NP-Za-km-z]{32,}|0x[0-9a-fA-F]{40}/.test(s);
}

function sentences(t: string): string[] {
  return t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9$"“])/).map((s) => s.trim()).filter((s) => s.length > 20 && s.length < 320 && !s.endsWith("?") && prose(s));
}

function clean(t: string): string {
  return t.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

/** Who's speaking about the project matters: its own metadata and site first, aggregators after, the X bio last. */
const DESC_ORDER = ["token metadata (IPFS)", "token metadata (Arweave)", "token metadata", "ft_metadata reference", "website", "CoinGecko", "X bio"];

function storyOf(descriptions: Research["descriptions"], site: Research["website"]): { lore: string | null; utility: string[]; meme: boolean } {
  const ordered = [...descriptions].sort((a, b) => DESC_ORDER.indexOf(a.source) - DESC_ORDER.indexOf(b.source));
  // The fullest real write-up wins, with the project's own words weighted up: a site meta tag with one stray
  // sentence shouldn't beat a CoinGecko paragraph, but a proper metadata description should.
  const weight = (src: string) => (src.startsWith("token metadata") || src === "ft_metadata reference" ? 1.25 : src === "website" ? 1.1 : src === "X bio" ? 0.6 : 1);
  const scored = ordered.map((d) => {
    const parts = sentences(clean(d.text)).slice(0, 3);
    return { d, parts, score: Math.min(parts.join(" ").length, 420) * weight(d.source) };
  });
  const top = scored.reduce<(typeof scored)[number] | null>((a, b) => (!a || b.score > a.score ? b : a), null);
  const best = top && top.score > 0 ? top : null;
  const fallback = ordered.find((d) => clean(d.text).length >= 30) ?? ordered[0];
  let lore: string | null = null;
  if (best) lore = best.parts.join(" ").slice(0, 480) || null;
  else if (fallback) lore = clean(fallback.text).slice(0, 480) || null;
  const pool = [...ordered.map((d) => clean(d.text)), site?.excerpt ?? ""].flatMap(sentences);
  const utility: string[] = [];
  for (const s of pool) {
    if (utility.length >= 3) break;
    if (UTILITY.test(s) && !NOT_UTILITY.test(s) && !HOW_TO.test(s) && !utility.includes(s) && !lore?.includes(s)) utility.push(s);
  }
  const all = pool.join(" ");
  const meme = /\b(meme(coin)?|dog|cat|frog|inu|pepe|community[- ]driven|no utility|for fun|degen)\b/i.test(all) || utility.length === 0;
  return { lore, utility, meme };
}

// ---------- entry points ----------

/** Fast: socials and descriptions from DexScreener, CoinGecko and the token's own metadata. For the landing page. */
export async function findLinks(token: TokenInfo | null, given: SocialInput = {}): Promise<{ links: Finding[]; descriptions: Research["descriptions"]; sources: string[] }> {
  const links = new Links();
  const descriptions: Research["descriptions"] = [];
  const sources: string[] = [];
  // What the team typed beats anything we find.
  for (const k of ["x", "telegram", "website", "discord"] as const) links.add(normalizeSocial(k, given[k]), "you");
  if (token) {
    for (const l of token.links) links.add(l.url, "DexScreener");
    if (token.links.length) sources.push("DexScreener");
    const tasks: Array<Promise<string | null>> = [
      coingecko(token, links, descriptions).then((ok) => (ok ? "CoinGecko" : null)),
      token.chain === "solana" ? solanaMetadata(token, links, descriptions) : token.chain === "near" ? nearMetadata(token, links, descriptions) : evmSource(token, links),
    ];
    for (const s of await Promise.all(tasks.map((p) => p.catch(() => null)))) if (s) sources.push(s);
  }
  return { links: links.items, descriptions, sources };
}

/** Everything: links, then the website and the X account they point to, then the story and voice. */
export async function research(token: TokenInfo | null, given: SocialInput = {}): Promise<Research> {
  const first = await findLinks(token, given);
  const links = new Links();
  for (const f of first.links) links.add(f.url, f.source);
  const descriptions = [...first.descriptions];
  const sources = [...first.sources];

  const siteUrl = links.first("website")?.url;
  const handle = xHandle(links.first("x")?.url);
  const [site, x, logoColor] = await Promise.all([
    siteUrl ? website(siteUrl, links, descriptions).catch(() => null) : Promise.resolve(null),
    handle ? readX(handle).catch(() => null) : Promise.resolve(null),
    logoAccent(token?.logo),
  ]);
  if (site) sources.push("website");
  if (x) {
    sources.push(x.via);
    for (const l of x.links) links.add(l, "X profile");
    if (x.profile.bio) descriptions.push({ text: x.profile.bio, source: "X bio" });
  }
  const story = storyOf(descriptions, site);
  const missing = (["x", "telegram", "website"] as const).filter((k) => !links.first(k));
  return {
    links: links.items,
    missing: [...missing],
    descriptions,
    website: site,
    x: x ? { profile: x.profile, posts: x.posts.slice(0, 12), voice: voiceOf(x.posts), via: x.via } : null,
    ...story,
    brand: site?.themeColor ? { color: site.themeColor, from: "website" } : logoColor ? { color: logoColor, from: "logo" } : null,
    sources: [...new Set(sources)],
  };
}

/** Socials named in a chat message: links, or an @handle next to the word X/Twitter (or on its own). */
export function socialsFromText(text: string): SocialInput {
  const out: SocialInput = {};
  const x = text.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\b/i)?.[1]
    ?? (/\b(x|twitter|handle)\b/i.test(text) || /^\s*@[A-Za-z0-9_]{1,15}\s*$/.test(text) ? text.match(/(?:^|\s)@([A-Za-z0-9_]{1,15})\b/)?.[1] : undefined);
  if (x && xHandle(x)) out.x = x;
  const tg = text.match(/(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/]{3,64}/i)?.[0] ?? (/\btelegram\b/i.test(text) ? text.match(/(?:^|\s)@([A-Za-z0-9_]{4,32})\b/)?.[1] : undefined);
  if (tg && tg !== out.x) out.telegram = tg;
  const dc = text.match(/discord\.(?:gg|com\/invite)\/[A-Za-z0-9-]+/i)?.[0];
  if (dc) out.discord = dc;
  for (const m of text.matchAll(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s]*)?/gi)) {
    const host = m[1].toLowerCase().replace(/^www\./, "");
    if (/^(x|twitter|t|telegram|discord)\.(com|me|gg)$/.test(host) || /\.near$|\.tg$/.test(host) || isVenueHost(host)) continue;
    // A bare word with a dot ("Bonk.fun" in a headline edit) counts only as a link or next to the word site.
    if (!/^(https?:\/\/|www\.)/i.test(m[0]) && !/\b(web)?site\b/i.test(text) && text.trim() !== m[0]) continue;
    out.website = m[0];
    break;
  }
  return out;
}
