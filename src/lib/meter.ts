import { AsyncLocalStorage } from "node:async_hooks";

// What a build or edit actually cost us, measured from each model's usage reply. Only calls on OUR keys are counted
// (a person's own key is billed to them by their provider). credits.ts turns the total into credits and takes them
// from the payer's allowance, so plan limits follow real cost, whatever model or retry path a request took.
//
// 1 credit = $0.01 of model cost at list price.

/** USD per million tokens, [input, output]. Unknown models fall back to the dearest so nothing is under-counted. */
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "z-ai/glm-5.3": [1, 3.2],
  "z-ai/glm-5.3-flash": [0.15, 0.6],
  "gpt-5.6-luna": [1.25, 10],
  // twitterapi.io, per item: tweets $0.15/1k, profiles $0.18/1k (counted as "output" tokens of 1 each, per million).
  "twitterapi:tweet": [0, 150],
  "twitterapi:profile": [0, 180],
};
const FALLBACK: [number, number] = [3, 15];

function priceOf(model: string): [number, number] {
  try {
    const extra = JSON.parse(process.env.MODEL_PRICES || "{}") as Record<string, [number, number]>;
    if (Array.isArray(extra[model])) return extra[model];
  } catch { /* bad env: ignore */ }
  return PRICES[model] ?? PRICES[model.split("/").pop() ?? ""] ?? FALLBACK;
}

export const costOf = (model: string, inTokens: number, outTokens: number) => {
  const [i, o] = priceOf(model);
  return (Math.max(0, inTokens) * i + Math.max(0, outTokens) * o) / 1e6;
};

/** A rough token count when a provider didn't say (a timed-out call still read its whole prompt). */
export const roughTokens = (text: string) => Math.ceil(text.length / 3.5);

export type Meter = { usd: number; ours: boolean };
const als = new AsyncLocalStorage<Meter>();

/** Runs fn against meter m; m.usd keeps what was spent even if fn throws. */
export const runMeter = <T>(m: Meter, fn: () => T): T => als.run(m, fn);

/** Runs fn with a fresh meter. ours=false: our keys are off for this run (the payer is out of credits but has a key). */
export async function withMeter<T>(fn: () => Promise<T>, ours = true): Promise<{ value: T; usd: number }> {
  const m: Meter = { usd: 0, ours };
  const value = await als.run(m, fn);
  return { value, usd: m.usd };
}

/** Counts a cost against the running meter (no-op outside one). */
export function addCost(usd: number): void {
  const m = als.getStore();
  if (m && Number.isFinite(usd) && usd > 0) m.usd += usd;
}

/** Whether this run may use our model keys. Outside a meter: yes (background jobs pay their own way). */
export const oursAllowed = (): boolean => als.getStore()?.ours ?? true;
