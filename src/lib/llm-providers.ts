// Every AI provider someone can bring a key for, shared by the server (llm.ts, apikeys.ts) and the browser (keys
// dialog, model catalog). The four originals have their own calls in llm.ts; the rest speak the OpenAI chat shape at
// their own base URL, so one call covers them all.

export const COMPAT = {
  gemini: { name: "Google Gemini", hint: "Gemini models.", base: "https://generativelanguage.googleapis.com/v1beta/openai", images: true, get: "https://aistudio.google.com/apikey" },
  xai: { name: "xAI", hint: "Grok models.", base: "https://api.x.ai/v1", images: true, get: "https://console.x.ai" },
  groq: { name: "Groq", hint: "Open models, very fast.", base: "https://api.groq.com/openai/v1", images: false, get: "https://console.groq.com/keys" },
  mistral: { name: "Mistral", hint: "Mistral and Devstral models.", base: "https://api.mistral.ai/v1", images: false, get: "https://console.mistral.ai/api-keys" },
  deepseek: { name: "DeepSeek", hint: "DeepSeek models.", base: "https://api.deepseek.com/v1", images: false, get: "https://platform.deepseek.com/api_keys" },
  huggingface: { name: "Hugging Face", hint: "Open models through Hugging Face Inference Providers.", base: "https://router.huggingface.co/v1", images: false, get: "https://huggingface.co/settings/tokens" },
} as const;

export type CompatId = keyof typeof COMPAT;
export const COMPAT_IDS = Object.keys(COMPAT) as CompatId[];
export const LLM_PROVIDER_IDS = ["nearai", "anthropic", "openai", "openrouter", "gemini", "xai", "groq", "mistral", "deepseek", "huggingface"] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];
export const isCompat = (id: string): id is CompatId => id in COMPAT;

export const PROVIDER_NAMES: Record<LlmProviderId, string> = {
  nearai: "NEAR AI Cloud", anthropic: "Anthropic", openai: "OpenAI", openrouter: "OpenRouter",
  ...(Object.fromEntries(COMPAT_IDS.map((id) => [id, COMPAT[id].name])) as Record<CompatId, string>),
};

/**
 * Which provider a pasted key most likely belongs to, best guess first. Most providers stamp a prefix on their keys;
 * the few that don't (or share "sk-") get several candidates, and the server tries each until one accepts it.
 */
export function guessProviders(raw: string): LlmProviderId[] {
  const k = raw.trim();
  if (k.startsWith("sk-ant-")) return ["anthropic"];
  if (k.startsWith("sk-or-")) return ["openrouter"];
  if (k.startsWith("AIza")) return ["gemini"];
  if (k.startsWith("xai-")) return ["xai"];
  if (k.startsWith("gsk_")) return ["groq"];
  if (k.startsWith("hf_")) return ["huggingface"];
  if (/^sk-(proj|svcacct|admin)-/.test(k)) return ["openai"];
  if (/^sk-[a-f0-9]{32}$/.test(k)) return ["deepseek", "openai", "nearai"];
  if (k.startsWith("sk-")) return ["openai", "nearai", "deepseek"];
  if (/^[A-Za-z0-9]{32}$/.test(k)) return ["mistral", "nearai"];
  return ["nearai", "mistral", "openai"];
}

/** A model picked from the catalog travels as "x:<provider>:<model id>". */
export function parsePick(v: string | null | undefined): { provider: LlmProviderId; model: string } | null {
  const m = v?.match(/^x:([a-z]+):([A-Za-z0-9._:/@+-]{1,160})$/);
  return m && (LLM_PROVIDER_IDS as readonly string[]).includes(m[1]) ? { provider: m[1] as LlmProviderId, model: m[2] } : null;
}
export const pickId = (provider: LlmProviderId, model: string) => `x:${provider}:${model}`;
