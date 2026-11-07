import { AsyncLocalStorage } from "node:async_hooks";
import type { ModelChoice } from "./models";
import type { Chain } from "./spec";

// The API keys and RPCs of whoever owns the project being worked on. A build or edit runs inside runWithKeys, and
// llm.ts / chain.ts / research.ts read it from here, so their signatures stay as they were. The same scope carries
// whether the owner's plan has priority models (entitlements "priorityModels"), for llm.ts to pick the model size.

export const KEY_IDS = ["nearai", "anthropic", "openai", "openrouter", "helius", "alchemy", "twitterapi", "rpc:near", "rpc:solana", "rpc:ethereum", "rpc:robinhood"] as const;
export type KeyId = (typeof KEY_IDS)[number];
export const LLM_KEYS = ["nearai", "anthropic", "openai", "openrouter"] as const satisfies readonly KeyId[];

export interface OwnerKeys {
  nearai?: string;
  anthropic?: string;
  openai?: string;
  openrouter?: string;
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

export const hasOwnLlm = (k: OwnerKeys | null) => !!k && LLM_KEYS.some((id) => !!k[id]);
