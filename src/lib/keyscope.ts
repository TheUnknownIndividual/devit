import { AsyncLocalStorage } from "node:async_hooks";
import { parsePick } from "./llm-providers";
import type { ModelChoice } from "./models";
import type { Chain } from "./spec";

// The API keys and RPCs of whoever owns the project being worked on. A build or edit runs inside runWithKeys, and
// llm.ts / chain.ts / research.ts read it from here, so their signatures stay as they were. The same scope carries
// whether the owner's plan has priority models (entitlements "priorityModels"), for llm.ts to pick the model size.

export const KEY_IDS = ["nearai", "anthropic", "openai", "openrouter", "gemini", "xai", "groq", "mistral", "deepseek", "huggingface", "helius", "alchemy", "twitterapi", "rpc:near", "rpc:solana", "rpc:ethereum", "rpc:robinhood"] as const;
export type KeyId = (typeof KEY_IDS)[number];
export const LLM_KEYS = ["nearai", "anthropic", "openai", "openrouter", "gemini", "xai", "groq", "mistral", "deepseek", "huggingface"] as const satisfies readonly KeyId[];
/** The keys the "auto" chain can run without a model picked (the others only run a model picked from the catalog). */
const AUTO_KEYS = ["nearai", "anthropic", "openai", "openrouter"] as const;

export interface OwnerKeys {
  nearai?: string;
  anthropic?: string;
  openai?: string;
  openrouter?: string;
  gemini?: string;
  xai?: string;
  groq?: string;
  mistral?: string;
  deepseek?: string;
  huggingface?: string;
  helius?: string;
  /** Alchemy: EVM reads (Ethereum, Base, BNB Chain) and token logos. */
  alchemy?: string;
  /** twitterapi.io: X posts and profiles for research and live posts on the published site. */
  twitterapi?: string;
  rpc?: Partial<Record<Chain, string>>;
}

const store = new AsyncLocalStorage<{ keys: OwnerKeys; priority: boolean; model: ModelChoice }>();

/** model: what the person picked in the chat box ("auto" unless they chose one). */
export function runWithKeys<T>(keys: OwnerKeys | null, fn: () => T, priority = false, model: ModelChoice = "auto"): T {
  return keys || priority || model !== "auto" ? store.run({ keys: keys ?? {}, priority, model }, fn) : fn();
}

export const ownerKeys = (): OwnerKeys => store.getStore()?.keys ?? {};
export const priorityModels = (): boolean => store.getStore()?.priority ?? false;
export const pickedModel = (): ModelChoice => store.getStore()?.model ?? "auto";

/** Whether this job can run on the person's own key: any auto-chain key, or the key behind a catalog model they picked. */
export const hasOwnLlm = (k: OwnerKeys | null, model: ModelChoice = "auto") => {
  if (!k) return false;
  if (AUTO_KEYS.some((id) => !!k[id])) return true;
  const p = parsePick(model);
  return !!p && !!k[p.provider];
};
