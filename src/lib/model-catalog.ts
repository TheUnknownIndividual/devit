import { ownerKeysFor } from "./accounts";
import { COMPAT, PROVIDER_NAMES, isCompat, type LlmProviderId } from "./llm-providers";

// Every model the chat box can be switched to: OpenRouter's whole list and Hugging Face's (both public), plus the
// models on each provider the person has their own key for (read with that key, never stored). The public lists are
// cached for an hour; a person's own lists for ten minutes.

export interface CatalogModel {
  /** "x:<provider>:<model id>", what the chat box sends. */
  id: string;
  provider: LlmProviderId;
  model: string;
  name: string;
  /** The lab that made it ("Anthropic", "Qwen"…). */
  vendor: string;
  ctx: number | null;
  /** USD per million tokens, in and out, when the list says. */
  price: { in: number; out: number } | null;
  vision: boolean;
  recommended?: boolean;
}

const HOUR = 3600_000;
let publicCache: { at: number; list: CatalogModel[] } | null = null;
const ownCache = new Map<string, { at: number; list: CatalogModel[] }>();

const VENDORS: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google", "x-ai": "xAI", deepseek: "DeepSeek", "z-ai": "Z.ai", moonshotai: "Moonshot",
  qwen: "Qwen", mistralai: "Mistral", "meta-llama": "Meta", meta: "Meta", minimax: "MiniMax", cohere: "Cohere", nvidia: "NVIDIA", microsoft: "Microsoft",
};
const vendorOf = (slug: string) => VENDORS[slug.toLowerCase()] ?? slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const perM = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6 * 1000) / 1000 : 0; };

// The newest model from each of these labs (OpenRouter lists newest first) is marked recommended.
const RECOMMEND = ["anthropic/claude-opus", "anthropic/claude-haiku", "anthropic/claude-sonnet", "openai/gpt-", "google/gemini-", "x-ai/grok-", "deepseek/deepseek-", "z-ai/glm-", "moonshotai/kimi-", "qwen/qwen", "mistralai/mistral-large"];

async function openrouter(): Promise<CatalogModel[]> {
  const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r?.ok) return [];
  const j = (await r.json().catch(() => null)) as { data?: Array<{ id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { input_modalities?: string[] } }> } | null;
  const seen = new Set<string>();
  return (j?.data ?? []).filter((m) => !m.id.includes(":")).map((m): CatalogModel => {
    const prefix = RECOMMEND.find((p) => m.id.startsWith(p) && !/-(pro|mini|nano|lite)$|flash|legal|omni|banana|image|audio|preview|exp|vision|code|-\d{4}$/.test(m.id));
    const rec = !!prefix && !seen.has(prefix);
    if (prefix) seen.add(prefix);
    const p = m.pricing;
    return {
      id: `x:openrouter:${m.id}`, provider: "openrouter", model: m.id, name: (m.name ?? m.id).replace(/^[^:]+:\s*/, ""), vendor: vendorOf(m.id.split("/")[0]),
      ctx: m.context_length ?? null, price: p ? { in: perM(p.prompt), out: perM(p.completion) } : null,
      vision: !!m.architecture?.input_modalities?.includes("image"), recommended: rec || undefined,
    };
  });
}

async function huggingface(): Promise<CatalogModel[]> {
  const r = await fetch("https://router.huggingface.co/v1/models", { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r?.ok) return [];
  const j = (await r.json().catch(() => null)) as { data?: Array<{ id: string; owned_by?: string; architecture?: { input_modalities?: string[] }; providers?: Array<{ status?: string; context_length?: number; pricing?: { input?: number; output?: number } }> }> } | null;
  return (j?.data ?? []).map((m): CatalogModel => {
    const live = (m.providers ?? []).filter((p) => p.status === "live");
    const cheapest = live.filter((p) => p.pricing).sort((a, b) => (a.pricing!.input ?? 0) - (b.pricing!.input ?? 0))[0];
    return {
      id: `x:huggingface:${m.id}`, provider: "huggingface", model: m.id, name: m.id.split("/").pop() ?? m.id, vendor: vendorOf(m.owned_by ?? m.id.split("/")[0]),
      ctx: Math.max(0, ...live.map((p) => p.context_length ?? 0)) || null,
      price: cheapest?.pricing ? { in: cheapest.pricing.input ?? 0, out: cheapest.pricing.output ?? 0 } : null,
      vision: !!m.architecture?.input_modalities?.includes("image"),
    };
  });
}

/** The models one provider offers on this key. */
async function native(provider: LlmProviderId, key: string): Promise<CatalogModel[]> {
  const t = AbortSignal.timeout(8000);
  let ids: string[] = [];
  try {
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: t });
      ids = r.ok ? ((await r.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [] : [];
    } else if (provider === "openai" || isCompat(provider) || provider === "nearai") {
      const base = provider === "openai" ? "https://api.openai.com/v1" : provider === "nearai" ? process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1" : COMPAT[provider as keyof typeof COMPAT].base;
      const r = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: t });
      ids = r.ok ? ((await r.json()) as { data?: { id: string }[] }).data?.map((m) => m.id.replace(/^models\//, "")) ?? [] : [];
    }
  } catch { /* provider down: show nothing for it */ }
  // Chat models only: leave out embeddings, speech, image and moderation models.
  ids = ids.filter((id) => !/embed|whisper|tts|dall-e|image|moderation|audio|realtime|transcribe|search|guard|rerank/i.test(id));
  return ids.slice(0, 200).map((m) => ({ id: `x:${provider}:${m}`, provider, model: m, name: m, vendor: PROVIDER_NAMES[provider], ctx: null, price: null, vision: false }));
}

/** Drop a person's cached own-key lists, after they add or remove a key. */
export const forgetOwnModels = (userId: string) => void ownCache.delete(userId);

export async function catalogFor(userId: string | undefined): Promise<CatalogModel[]> {
  if (!publicCache || Date.now() - publicCache.at > HOUR) {
    const [or, hf] = await Promise.all([openrouter(), huggingface()]);
    if (or.length || hf.length) publicCache = { at: Date.now(), list: [...or, ...hf] };
  }
  let own: CatalogModel[] = [];
  if (userId) {
    const hit = ownCache.get(userId);
    if (hit && Date.now() - hit.at < 10 * 60_000) own = hit.list;
    else {
      const k = (await ownerKeysFor(userId)) ?? {};
      const mine = (["anthropic", "openai", "gemini", "xai", "groq", "mistral", "deepseek", "nearai"] as const).filter((p) => !!k[p]);
      own = (await Promise.all(mine.map((p) => native(p, k[p]!)))).flat();
      ownCache.set(userId, { at: Date.now(), list: own });
    }
  }
  return [...own, ...(publicCache?.list ?? [])];
}
