// One wrapper for every model call: NEAR AI Cloud first (private TEE inference), then Claude, then OpenAI (the key
// neartrade already runs on, for local work until a NEAR AI key is in). With no key set, callers fall back to the
// offline rule-based writer, so the builder always works.
//
// Each call names a tier so credits go where they matter: "light" (one or two plain edits) runs each provider's small
// model, "heavy" (writing a whole site, restyling from a reference, edits across many blocks) its big one. A light
// answer that doesn't validate is asked again of the same provider's heavy model before moving on.
//
// A signed-in owner's own keys (Settings → API keys, read through keyscope) go first, then ours.

import { hasOwnLlm, ownerKeys } from "./keyscope";

export interface LlmResult { text: string; via: string }

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
  return !!(process.env.NEAR_AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) || hasOwnLlm(ownerKeys());
}

type Call = (system: string, user: string, timeoutMs: number, tier: Tier, key: string) => Promise<LlmResult | null>;

const nearAi: Call = async (system, user, timeoutMs, tier, key) => {
  const model = MODELS.nearAi[tier];
  try {
    const r = await fetch(`${NEAR_AI_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    return text ? { text, via: `NEAR AI Cloud · ${model.split("/").pop()}` } : null;
  } catch {
    return null;
  }
};

const claude: Call = async (system, user, timeoutMs, tier, key) => {
  const model = MODELS.claude[tier];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: tier === "light" ? 2000 : 6000, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = j.content?.find((c) => c.type === "text")?.text;
    return text ? { text, via: `Claude · ${model}` } : null;
  } catch {
    return null;
  }
};

const openai: Call = async (system, user, timeoutMs, tier, key) => {
  const model = MODELS.openai[tier];
  try {
    const effort = tier === "light" ? "low" : process.env.OPENAI_REASONING_EFFORT;
    const r = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        ...(effort ? { reasoning_effort: effort } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    return text ? { text, via: `OpenAI · ${model}` } : null;
  } catch {
    return null;
  }
};

const openrouter: Call = async (system, user, timeoutMs, tier, key) => {
  const model = MODELS.openrouter[tier];
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-title": "sitesmith" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    return text ? { text, via: `OpenRouter · ${j.model ?? model}` } : null;
  } catch {
    return null;
  }
};

/** Who to ask, in order: the owner's own keys, then the server's. */
function providers(): Array<{ call: Call; key: string; own: boolean }> {
  const k = ownerKeys();
  const own = ([[nearAi, k.nearai], [claude, k.anthropic], [openai, k.openai], [openrouter, k.openrouter]] as const).filter(([, key]) => !!key).map(([call, key]) => ({ call, key: key!, own: true }));
  const ours = ([[nearAi, process.env.NEAR_AI_API_KEY], [claude, process.env.ANTHROPIC_API_KEY], [openai, process.env.OPENAI_API_KEY]] as const).filter(([, key]) => !!key).map(([call, key]) => ({ call, key: key!, own: false }));
  return [...own, ...ours];
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
export async function askJson<T>(system: string, user: string, validate: (v: unknown) => T | null, tier: Tier = "heavy"): Promise<{ value: T; via: string } | null> {
  const sys = system + "\nReply with one JSON object only, no prose, no code fences.";
  for (const { call, key, own } of providers()) {
    for (const t of tier === "light" ? (["light", "heavy"] as const) : (["heavy"] as const)) {
      const res = await call(sys, user, t === "light" ? 25_000 : 60_000, t, key);
      if (!res) break;
      const v = parse(res.text, validate);
      if (v) return { value: v, via: own ? `${res.via} · your key` : res.via };
    }
  }
  return null;
}
