import { BUILD_SLOTS } from "./plans";

// At most BUILD_SLOTS builds run on our models at once, in this process. Past that a build waits; paid builds go
// ahead of free ones in the line. Builds on the owner's own model key don't take a slot.

interface Q { running: number; waiting: Array<{ paid: boolean; go: () => void }> }
const g = globalThis as typeof globalThis & { __ssBuildQueue?: Q };
const q: Q = (g.__ssBuildQueue ??= { running: 0, waiting: [] });

export const buildLoad = () => ({ running: q.running, waiting: q.waiting.length });

export async function withBuildSlot<T>(paid: boolean, fn: () => Promise<T>, onWait?: () => Promise<unknown>): Promise<T> {
  if (q.running >= BUILD_SLOTS) {
    // In line first (synchronously), then tell the project, so a slot freed meanwhile isn't missed.
    const turn = new Promise<void>((go) => {
      const i = paid ? q.waiting.findIndex((w) => !w.paid) : -1;
      q.waiting.splice(i < 0 ? q.waiting.length : i, 0, { paid, go });
    });
    await onWait?.().catch(() => undefined);
    await turn;
  } else q.running++;
  try {
    return await fn();
  } finally {
    // Hand the slot straight to the next in line, so running stays the same.
    const next = q.waiting.shift();
    if (next) next.go(); else q.running--;
  }
}
