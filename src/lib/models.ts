// The models a person can pick in the builder's chat box. "auto" keeps the normal order (NEAR AI, then Claude, then
// OpenAI) and sizes the model to the job; any other choice goes to that model first and falls back to auto if it can't
// answer, so a pick never breaks a build. Open to every plan.

export const MODEL_CHOICES = [
  { id: "auto", label: "Auto", note: "Picks the model for each job", provider: null },
  { id: "glm", label: "GLM 5.3", note: "NEAR AI Cloud · private inference", provider: "nearai" },
  { id: "claude-sonnet", label: "Claude Sonnet 5.5", note: "Best writing and layout", provider: "anthropic" },
  { id: "claude-haiku", label: "Claude Haiku 5.5", note: "Fastest edits", provider: "anthropic" },
  { id: "gpt", label: "GPT-5.6", note: "OpenAI", provider: "openai" },
  { id: "openrouter", label: "OpenRouter", note: "Any model, on your OpenRouter key", provider: "openrouter" },
] as const;

export type ModelChoice = (typeof MODEL_CHOICES)[number]["id"];
export type ModelProvider = Exclude<(typeof MODEL_CHOICES)[number]["provider"], null>;
export const isModelChoice = (v: unknown): v is ModelChoice => typeof v === "string" && MODEL_CHOICES.some((m) => m.id === v);

/** The chat box sends its pick in an x-model header, so the routes' bodies stay as they were. */
export const modelFrom = (req: Request): ModelChoice => { const v = req.headers.get("x-model"); return isModelChoice(v) ? v : "auto"; };
