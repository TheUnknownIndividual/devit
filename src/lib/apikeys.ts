import { isPublicHttps } from "./net";
import type { KeyId } from "./keyscope";
import { COMPAT, guessProviders, isCompat, type LlmProviderId } from "./llm-providers";

// "Verify" for each key people bring: the cheapest call that only succeeds with a good key. None of these spend
// credits. The key goes to the provider and nowhere else; it's never logged.

export const KEY_LABELS: Record<KeyId, { name: string; hint: string; get: string }> = {
  nearai: { name: "NEAR AI Cloud", hint: "Private inference in a TEE. Runs first.", get: "https://cloud.near.ai" },
  anthropic: { name: "Anthropic", hint: "Claude models.", get: "https://console.anthropic.com/settings/keys" },
  openai: { name: "OpenAI", hint: "GPT models.", get: "https://platform.openai.com/api-keys" },
  openrouter: { name: "OpenRouter", hint: "Hundreds of models, one key.", get: "https://openrouter.ai/keys" },
  gemini: { name: COMPAT.gemini.name, hint: COMPAT.gemini.hint, get: COMPAT.gemini.get },
  xai: { name: COMPAT.xai.name, hint: COMPAT.xai.hint, get: COMPAT.xai.get },
  groq: { name: COMPAT.groq.name, hint: COMPAT.groq.hint, get: COMPAT.groq.get },
  mistral: { name: COMPAT.mistral.name, hint: COMPAT.mistral.hint, get: COMPAT.mistral.get },
  deepseek: { name: COMPAT.deepseek.name, hint: COMPAT.deepseek.hint, get: COMPAT.deepseek.get },
  huggingface: { name: COMPAT.huggingface.name, hint: COMPAT.huggingface.hint, get: COMPAT.huggingface.get },
  helius: { name: "Helius", hint: "Solana names, logos and reads.", get: "https://dashboard.helius.dev" },
  alchemy: { name: "Alchemy", hint: "Ethereum, Base and BNB Chain reads and token logos. Paste the API key or any Alchemy RPC URL.", get: "https://dashboard.alchemy.com" },
  twitterapi: { name: "twitterapi.io", hint: "Your X posts in builds, and kept fresh on your live site.", get: "https://twitterapi.io/dashboard" },
  "rpc:near": { name: "NEAR RPC", hint: "Used for NEAR reads in your builds.", get: "https://fastnear.com" },
  "rpc:solana": { name: "Solana RPC", hint: "Wins over Helius for Solana reads.", get: "https://drpc.org" },
  "rpc:ethereum": { name: "Ethereum RPC", hint: "Used for Ethereum reads.", get: "https://drpc.org" },
  "rpc:robinhood": { name: "Robinhood Chain RPC", hint: "Used for Robinhood Chain reads.", get: "https://drpc.org" },
};

const PROBE: Record<string, string> = { near: "status", solana: "getHealth", ethereum: "eth_chainId", robinhood: "eth_chainId" };

/** People often paste the whole RPC URL from a dashboard; keep just the key part. */
export function normalizeKey(id: KeyId, v: string): string {
  const t = v.trim();
  if (id === "alchemy") return t.match(/^https:\/\/[a-z0-9-]+\.g\.alchemy\.com\/v2\/([A-Za-z0-9_-]+)/i)?.[1] ?? t;
  if (id === "helius") return t.match(/^https:\/\/[a-z0-9.-]*helius-rpc\.com\/?\?api-key=([A-Za-z0-9-]+)/i)?.[1] ?? t;
  return t;
}

export function shapeOk(id: KeyId, v: string): string | null {
  if (id.startsWith("rpc:")) return isPublicHttps(v) ? null : "Use a public https RPC URL.";
  if (v.length < 16 || v.length > 400 || /\s/.test(v)) return "That doesn't look like an API key.";
  return null;
}

export async function verifyKey(id: KeyId, key: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bad = shapeOk(id, key);
  if (bad) return { ok: false, reason: bad };
  const t = AbortSignal.timeout(8000);
  try {
    let r: Response;
    if (id === "nearai") {
      // An empty completion request: a good key gets a 400 for the missing model, a bad one a 401. Nothing runs.
      r = await fetch(`${process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1"}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: "{}", signal: t });
      return r.status === 401 || r.status === 403 ? { ok: false, reason: "NEAR AI Cloud rejected that key." } : r.status < 500 ? { ok: true } : { ok: false, reason: "NEAR AI Cloud didn't answer. Try again." };
    }
    if (id === "anthropic") r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: t });
    else if (id === "openai") r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` }, signal: t });
    else if (id === "gemini") r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": key }, signal: t });
    else if (id === "huggingface") r = await fetch("https://huggingface.co/api/whoami-v2", { headers: { authorization: `Bearer ${key}` }, signal: t });
    else if (isCompat(id)) r = await fetch(`${COMPAT[id].base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: t });
    else if (id === "openrouter") r = await fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${key}` }, signal: t });
    else if (id === "twitterapi") r = await fetch("https://api.twitterapi.io/oapi/my/info", { headers: { "X-API-Key": key }, signal: t });
    else if (id === "helius") r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }), signal: t });
    else if (id === "alchemy") {
      r = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: t });
      const j = (await r.json().catch(() => null)) as { result?: unknown } | null;
      return j && "result" in j ? { ok: true } : { ok: false, reason: "Alchemy rejected that key." };
    }
    else {
      r = await fetch(key, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: PROBE[id.slice(4)], params: [] }), signal: t, redirect: "error" });
      const j = (await r.json().catch(() => null)) as { result?: unknown } | null;
      return j && "result" in j ? { ok: true } : { ok: false, reason: "That RPC didn't answer a basic call." };
    }
    if (r.ok) return { ok: true };
    return { ok: false, reason: r.status === 401 || r.status === 403 ? `${KEY_LABELS[id].name} rejected that key.` : `${KEY_LABELS[id].name} answered ${r.status}. Try again.` };
  } catch {
    return { ok: false, reason: "Couldn't reach the provider. Try again in a moment." };
  }
}

/**
 * A key pasted without saying whose it is: try the likely providers in order until one accepts it. Each try is the
 * same free check as Verify, so a wrong guess costs nothing.
 */
export async function detectKey(key: string): Promise<{ ok: true; id: LlmProviderId } | { ok: false; reason: string }> {
  const tried: string[] = [];
  for (const id of guessProviders(key)) {
    const r = await verifyKey(id, key);
    if (r.ok) return { ok: true, id };
    tried.push(KEY_LABELS[id].name);
    if (r.reason.startsWith("That doesn't look")) return r;
  }
  return { ok: false, reason: `No provider accepted it (tried ${tried.join(", ")}). Check the key, or add it under its provider below.` };
}
