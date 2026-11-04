import { AsyncLocalStorage } from "node:async_hooks";
import type { Chain } from "./spec";

// The API keys and RPCs of whoever owns the project being worked on. A build or edit runs inside runWithKeys, and
// llm.ts / chain.ts / research.ts read it from here, so their signatures stay as they were.

export const KEY_IDS = ["nearai", "anthropic", "openai", "openrouter", "helius", "rpc:near", "rpc:solana", "rpc:ethereum", "rpc:robinhood"] as const;
export type KeyId = (typeof KEY_IDS)[number];
export const LLM_KEYS = ["nearai", "anthropic", "openai", "openrouter"] as const satisfies readonly KeyId[];

export interface OwnerKeys {
  nearai?: string;
  anthropic?: string;
  openai?: string;
  openrouter?: string;
  helius?: string;
  rpc?: Partial<Record<Chain, string>>;
}

const store = new AsyncLocalStorage<OwnerKeys>();

export function runWithKeys<T>(keys: OwnerKeys | null, fn: () => T): T {
  return keys ? store.run(keys, fn) : fn();
}

export const ownerKeys = (): OwnerKeys => store.getStore() ?? {};

export const hasOwnLlm = (k: OwnerKeys | null) => !!k && LLM_KEYS.some((id) => !!k[id]);
