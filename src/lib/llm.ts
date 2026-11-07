// One wrapper for every model call: NEAR AI Cloud first (private TEE inference), then Claude, then OpenAI (the key
// neartrade already runs on, for local work until a NEAR AI key is in). With no key set, callers fall back to the
// offline rule-based writer, so the builder always works.
//
// Each call names a tier so credits go where they matter: "light" (one or two plain edits) runs each provider's small
// model, "heavy" (writing a whole site, restyling from a reference, edits across many blocks) its big one. A light
// answer that doesn't validate is asked again of the same provider's heavy model before moving on.
//
// A signed-in owner's own keys (Settings → API keys, read through keyscope) go first, at the tier asked for. On our
// keys the owner's plan decides: priority models (Pro/Team) get the big model for every call, free owners' edits and
// comments run on the small one, and builds keep the big one.

import { hasOwnLlm, ownerKeys, pickedModel, priorityModels } from "./keyscope";
import type { ModelChoice } from "./models";
import { addCost, costOf, oursAllowed } from "./meter";

/** usage: tokens the provider reported, for the meter (our keys only). */
export interface LlmResult { text: string; via: string; model: string; usage?: { in: number; out: number } }

/** Output caps on every provider, so one reply can never run up an open-ended bill. */
const MAX_OUT: Record<Tier, number> = { light: 2000, heavy: 6000 };

type OaiUsage = { prompt_tokens?: number; completion_tokens?: number };
const oaiUsage = (u?: OaiUsage) => (u ? { in: u.prompt_tokens ?? 0, out: u.completion_tokens ?? 0 } : undefined);

const NEAR_AI_URL = process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1";
export type Tier = "light" | "heavy";

const NEAR_AI_MODEL = process.env.NEAR_AI_MODEL || "z-ai/glm-5.3";
const NEAR_AI_MODEL_LIGHT = process.env.NEAR_AI_MODEL_LIGHT || "z-ai/glm-5.3-flash";
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const CLAUDE_MODEL_LIGHT = process.env.ANTHROPIC_MODEL_LIGHT || "claude-haiku-5-5";
const OPENAI_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
// Unset: the same model, thinking less.
const OPENAI_MODEL_LIGHT = process.env.OPENAI_MODEL_LIGHT || OPENAI_MODEL;
// Only for people who bring an OpenRouter key; "openrouter/auto" lets OpenRouter pick.
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

const MODELS: Record<"nearAi" | "claude" | "openai" | "openrouter", Record<Tier, string>> = {
  nearAi: { light: NEAR_AI_MODEL_LIGHT, heavy: NEAR_AI_MODEL },
  claude: { light: CLAUDE_MODEL_LIGHT, heavy: CLAUDE_MODEL },
  openai: { light: OPENAI_MODEL_LIGHT, heavy: OPENAI_MODEL },
  openrouter: { light: process.env.OPENROUTER_MODEL_LIGHT || OPENROUTER_MODEL, heavy: OPENROUTER_MODEL },
};

export function llmAvailable(): boolean {
  return (oursAllowed() && !!(process.env.NEAR_AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)) || hasOwnLlm(ownerKeys());
}

type Call = (system: string, user: string, timeoutMs: number, tier: Tier, key: string, model?: string) => Promise<LlmResult | null>;

/** A picked model: which provider runs it and the exact model id (null: that provider's own default). */
const PICKS: Record<Exclude<ModelChoice, "auto">, { provider: "nearai" | "anthropic" | "openai" | "openrouter"; model: string }> = {
  glm: { provider: "nearai", model: NEAR_AI_MODEL },
  "claude-sonnet": { provider: "anthropic", model: CLAUDE_MODEL },
  "claude-haiku": { provider: "anthropic", model: CLAUDE_MODEL_LIGHT },
  gpt: { provider: "openai", model: OPENAI_MODEL },
  openrouter: { provider: "openrouter", model: OPENROUTER_MODEL },
};

/** Which picks can run right now: on the server's keys or the person's own. */
export function modelAvailability(own: Partial<Record<"nearai" | "anthropic" | "openai" | "openrouter", boolean>>): Record<ModelChoice, boolean> {
  const server = { nearai: !!process.env.NEAR_AI_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY, openrouter: false };
  const out = { auto: true } as Record<ModelChoice, boolean>;
  for (const [id, p] of Object.entries(PICKS)) out[id as ModelChoice] = server[p.provider] || !!own[p.provider];
  return out;
}

const nearAi: Call = async (system, user, timeoutMs, tier, key, picked) => {
  const model = picked ?? MODELS.nearAi[tier];
  try {
    const r = await fetch(`${NEAR_AI_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.7,
        max_tokens: MAX_OUT[tier],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: OaiUsage };
    const text = j.choices?.[0]?.message?.content;
    return text ? { text, via: `NEAR AI Cloud · ${model.split("/").pop()}`, model, usage: oaiUsage(j.usage) } : null;
  } catch {
    return null;
  }
};

const claude: Call = async (system, user, timeoutMs, tier, key, picked) => {
  const model = picked ?? MODELS.claude[tier];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: MAX_OUT[tier], system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    const text = j.content?.find((c) => c.type === "text")?.text;
    const u = j.usage;
    return text ? { text, via: `Claude · ${model}`, model, usage: u ? { in: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), out: u.output_tokens ?? 0 } : undefined } : null;
  } catch {
    return null;
  }
};

const openai: Call = async (system, user, timeoutMs, tier, key, picked) => {
  const model = picked ?? MODELS.openai[tier];
  try {
    const effort = tier === "light" ? "low" : process.env.OPENAI_REASONING_EFFORT;
    const r = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        // Reasoning counts toward this, so it's roomier than the visible reply needs.
        max_completion_tokens: MAX_OUT[tier] * 2,
        ...(effort ? { reasoning_effort: effort } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: OaiUsage };
    const text = j.choices?.[0]?.message?.content;
    return text ? { text, via: `OpenAI · ${model}`, model, usage: oaiUsage(j.usage) } : null;
  } catch {
    return null;
  }
};

const openrouter: Call = async (system, user, timeoutMs, tier, key, picked) => {
  const model = picked ?? MODELS.openrouter[tier];
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-title": "devit" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    return text ? { text, via: `OpenRouter · ${j.model ?? model}`, model: j.model ?? model } : null;
  } catch {
    return null;
  }
};

type Provider = { call: Call; key: string; own: boolean; id: "nearai" | "anthropic" | "openai" | "openrouter"; model?: string };

/** Who to ask, in order: the picked model first (own key, then ours), then the owner's own keys, then the server's. */
function providers(): Provider[] {
  const k = ownerKeys();
  const own: Provider[] = ([[nearAi, k.nearai, "nearai"], [claude, k.anthropic, "anthropic"], [openai, k.openai, "openai"], [openrouter, k.openrouter, "openrouter"]] as const).filter(([, key]) => !!key).map(([call, key, id]) => ({ call, key: key!, own: true, id }));
  const ours: Provider[] = !oursAllowed() ? [] : ([[nearAi, process.env.NEAR_AI_API_KEY, "nearai"], [claude, process.env.ANTHROPIC_API_KEY, "anthropic"], [openai, process.env.OPENAI_API_KEY, "openai"]] as const).filter(([, key]) => !!key).map(([call, key, id]) => ({ call, key: key!, own: false, id }));
  const choice = pickedModel();
  if (choice === "auto") return [...own, ...ours];
  const pick = PICKS[choice];
  const first = [...own, ...ours].filter((x) => x.id === pick.provider).map((x) => ({ ...x, model: pick.model }));
  return [...first, ...own, ...ours];
}

function parse<T>(text: string, validate: (v: unknown) => T | null): T | null {
  const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return validate(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
  } catch {
    return null;
  }
}

/**
 * Ask for JSON. Returns the parsed object and which provider and model answered, or null if nobody could. A light
 * call that comes back unusable is retried on that provider's heavy model before the next provider is tried.
 */
export async function askJson<T>(system: string, user: string, validate: (v: unknown) => T | null, tier: Tier = "heavy", use: "build" | "edit" = "build"): Promise<{ value: T; via: string } | null> {
  const sys = system + "\nReply with one JSON object only, no prose, no code fences.";
  const ours: Tier = priorityModels() ? "heavy" : use === "edit" ? "light" : tier;
  for (const { call, key, own, model } of providers()) {
    // A picked model runs as picked, once; the rest size themselves to the job.
    const tiers = model ? (["heavy"] as const) : (own ? tier : ours) === "light" ? (["light", "heavy"] as const) : (["heavy"] as const);
    for (const t of tiers) {
      const res = await call(sys, user, t === "light" ? 25_000 : 60_000, t, key, model);
      if (!res) break;
      // Our key: what it cost goes on the meter, valid answer or not.
      if (!own) addCost(res.usage ? costOf(res.model, res.usage.in, res.usage.out) : costOf(res.model, (sys.length + user.length) / 3.5, MAX_OUT[t]));
      const v = parse(res.text, validate);
      if (v) return { value: v, via: own ? `${res.via} · your key` : res.via };
    }
  }
  return null;
}
