import { NextResponse } from "next/server";
import { ownerKeysFor, viewer } from "@/lib/accounts";
import { modelAvailability } from "@/lib/llm";
import { LLM_PROVIDER_IDS, type LlmProviderId } from "@/lib/llm-providers";

// Which models the chat box can offer right now: on the server's keys, or on the signed-in person's own. `own` says
// which providers they have a key for, so models picked from the catalog show whether they can run.
export async function GET() {
  const { user } = await viewer();
  const k = (await ownerKeysFor(user?.id)) ?? {};
  const own = Object.fromEntries(LLM_PROVIDER_IDS.map((id) => [id, !!k[id]])) as Record<LlmProviderId, boolean>;
  return NextResponse.json({ available: modelAvailability(own), own, signedIn: !!user }, { headers: { "cache-control": "no-store" } });
}
