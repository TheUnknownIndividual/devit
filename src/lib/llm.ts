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

// ---------- Long calls with pictures (art direction, generated-code sites) ----------
//
// The site designer's calls differ from askJson: they look at the token's pictures (Claude reads image URLs; the
// others get the URLs listed as text), they can run for minutes, and codegen streams so finished sections save as
// they arrive. Same provider order, same meter.

export interface LocalImage { media: string; data: string; label: string }

export interface RichAsk {
  system: string;
  user: string;
  /** Public https image URLs (logo, banner, post pictures). Claude sees them; other providers get them as text. */
  images?: string[];
  /** Pictures we hold locally (reference screenshots, review shots): base64, sent after the URL images with a label. */
  files?: LocalImage[];
  maxOut: number;
  timeoutMs: number;
  /** Streamed text as it arrives (accumulated so far). */
  onText?: (soFar: string) => void;
  temperature?: number;
  /**
   * Claude's thinking before it answers: "off" for calls that only execute a plan (codegen streams at once), an
   * effort level for calls that analyse. Thinking counts toward maxOut, so analysing calls get room for both.
   */
  think?: "off" | "low" | "medium" | "high";
}

type AnthropicUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
const anthUsage = (u?: AnthropicUsage) => (u ? { in: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), out: u.output_tokens ?? 0 } : undefined);

/** Reads an SSE body, handing each `data:` payload to `on`. */
async function sse(body: ReadableStream<Uint8Array>, on: (data: string) => void): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) on(line.slice(5).trim());
    }
  }
}

/** Pictures Anthropic will be able to fetch: one dead URL fails the whole request, so each is checked first. */
async function reachable(urls: string[]): Promise<string[]> {
  const ok = await Promise.all(urls.filter((u) => /^https:\/\//.test(u)).slice(0, 6).map(async (u) => {
    try {
      const r = await fetch(u, { method: "GET", headers: { range: "bytes=0-1023" }, signal: AbortSignal.timeout(4000) });
      void r.body?.cancel();
      return r.ok && /^image\/(png|jpe?g|gif|webp)/i.test(r.headers.get("content-type") ?? "") ? u : null;
    } catch {
      return null;
    }
  }));
  return ok.filter((u): u is string => !!u);
}

async function richClaude(a: RichAsk, key: string, model: string, withImages: boolean): Promise<LlmResult | null> {
  const imgs = withImages ? await reachable(a.images ?? []) : [];
  const files = withImages ? (a.files ?? []).slice(0, 6) : [];
  const content = [
    ...imgs.map((url) => ({ type: "image", source: { type: "url", url } })),
    ...files.flatMap((f) => [{ type: "text", text: f.label }, { type: "image", source: { type: "base64", media_type: f.media, data: f.data } }]),
    { type: "text", text: a.user },
  ];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    // No temperature: current Claude models reject it. "between_tools" is how this model turns thinking off.
    body: JSON.stringify({
      model, max_tokens: a.maxOut, stream: true, system: a.system, messages: [{ role: "user", content }],
      ...(a.think === "off" ? { thinking: { type: "between_tools" } } : { thinking: { type: "adaptive" }, output_config: { effort: a.think ?? "medium" } }),
    }),
    signal: AbortSignal.timeout(a.timeoutMs),
  });
  if (!r.ok || !r.body) {
    // Status and the API's own error message only (never prompt text), so a failing provider is visible in the logs.
    console.warn(`[llm] anthropic ${model} ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
    return null;
  }
  let text = "";
  const usage: AnthropicUsage = {};
  await sse(r.body, (d) => {
    try {
      const j = JSON.parse(d) as { type: string; delta?: { type?: string; text?: string; stop_reason?: string }; message?: { usage?: AnthropicUsage }; usage?: AnthropicUsage };
      if (j.type === "message_delta" && j.delta?.stop_reason === "max_tokens") console.warn(`[llm] anthropic ${model} hit max_tokens (${a.maxOut})`);
      if (j.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text) { text += j.delta.text; a.onText?.(text); }
      else if (j.type === "message_start" && j.message?.usage) Object.assign(usage, j.message.usage);
      else if (j.type === "message_delta" && j.usage) Object.assign(usage, j.usage);
    } catch { /* keep-alive or partial line */ }
  });
  return text ? { text, via: `Claude · ${model}`, model, usage: anthUsage(usage) } : null;
}

async function richOpenAiShape(a: RichAsk, url: string, key: string, model: string, label: string, opts: { images: boolean; reasoning?: boolean }): Promise<LlmResult | null> {
  const listed = (a.images ?? []).length ? `\n\nPictures of the token (URLs, you can't open them; use them as <img src> where the brief says):\n${a.images!.join("\n")}` : "";
  const user = opts.images && (a.images?.length || a.files?.length)
    ? [
        { type: "text", text: a.user },
        ...(a.images ?? []).slice(0, 6).map((u) => ({ type: "image_url", image_url: { url: u } })),
        ...(a.files ?? []).slice(0, 6).flatMap((f) => [{ type: "text", text: f.label }, { type: "image_url", image_url: { url: `data:${f.media};base64,${f.data}` } }]),
      ]
    : a.user + listed;
  const r = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-title": "devit" },
    body: JSON.stringify({
      model, stream: true, stream_options: { include_usage: true },
      messages: [{ role: "system", content: a.system }, { role: "user", content: user }],
      ...(opts.reasoning ? { max_completion_tokens: a.maxOut * 2 } : { max_tokens: a.maxOut, temperature: a.temperature ?? 0.8 }),
    }),
    signal: AbortSignal.timeout(a.timeoutMs),
  });
  if (!r.ok || !r.body) {
    console.warn(`[llm] ${label} ${model} ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
    return null;
  }
  let text = "";
  let usage: { in: number; out: number } | undefined;
  await sse(r.body, (d) => {
    if (d === "[DONE]") return;
    try {
      const j = JSON.parse(d) as { choices?: { delta?: { content?: string } }[]; usage?: OaiUsage };
      const piece = j.choices?.[0]?.delta?.content;
      if (piece) { text += piece; a.onText?.(text); }
      if (j.usage) usage = oaiUsage(j.usage);
    } catch { /* partial */ }
  });
  return text ? { text, via: `${label} · ${model.split("/").pop()}`, model, usage } : null;
}

/**
 * One long call with pictures, streamed, best provider first: Claude (sees the pictures), then NEAR AI GLM, then
 * OpenAI (pictures inline), then OpenRouter. `accept` decides whether a reply is usable (else the next provider is
 * asked). Returns the text and who answered, or null.
 */
export async function askRich(a: RichAsk, accept: (text: string) => boolean = (t) => t.length > 0): Promise<{ text: string; via: string } | null> {
  const order = (p: Provider) => (p.model ? -1 : ({ anthropic: 0, nearai: 1, openai: 2, openrouter: 3 } as const)[p.id]);
  const list = providers().sort((x, y) => order(x) - order(y) || Number(y.own) - Number(x.own));
  const seen = new Set<string>();
  for (const p of list) {
    const id = `${p.id}:${p.own}:${p.model ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let res: LlmResult | null = null;
    try {
      if (p.id === "anthropic") {
        const model = p.model ?? CLAUDE_MODEL;
        res = (await richClaude(a, p.key, model, true)) ?? (a.images?.length || a.files?.length ? await richClaude(a, p.key, model, false) : null);
      } else if (p.id === "nearai") res = await richOpenAiShape(a, NEAR_AI_URL, p.key, p.model ?? NEAR_AI_MODEL, "NEAR AI Cloud", { images: false });
      else if (p.id === "openai") res = await richOpenAiShape(a, OPENAI_URL, p.key, p.model ?? OPENAI_MODEL, "OpenAI", { images: true, reasoning: true });
      else res = await richOpenAiShape(a, "https://openrouter.ai/api/v1", p.key, p.model ?? OPENROUTER_MODEL, "OpenRouter", { images: false });
    } catch (e) {
      console.warn(`[llm] ${p.id} failed: ${e instanceof Error ? e.name + " " + e.message : "error"}`);
      res = null;
    }
    if (!res) continue;
    if (!p.own) addCost(res.usage ? costOf(res.model, res.usage.in, res.usage.out) : costOf(res.model, (a.system.length + a.user.length) / 3.5, a.maxOut));
    if (accept(res.text)) return { text: res.text, via: p.own ? `${res.via} · your key` : res.via };
    console.warn(`[llm] ${p.id} reply rejected (${res.text.length} chars)`);
  }
  return null;
}

/** askRich for one JSON object, validated. */
export async function askRichJson<T>(a: RichAsk, validate: (v: unknown) => T | null): Promise<{ value: T; via: string } | null> {
  let value: T | null = null;
  const res = await askRich({ ...a, system: a.system + "\nReply with one JSON object only, no prose, no code fences." }, (t) => (value = parse(t, validate)) != null);
  return res && value ? { value, via: res.via } : null;
}
