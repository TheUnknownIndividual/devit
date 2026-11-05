import { NextResponse } from "next/server";
import { ownerKeysFor, viewer } from "@/lib/accounts";
import { modelAvailability } from "@/lib/llm";

// Which models the chat box can offer right now: on the server's keys, or on the signed-in person's own.
export async function GET() {
  const { user } = await viewer();
  const k = (await ownerKeysFor(user?.id)) ?? {};
  const available = modelAvailability({ nearai: !!k.nearai, anthropic: !!k.anthropic, openai: !!k.openai, openrouter: !!k.openrouter });
  return NextResponse.json({ available, signedIn: !!user }, { headers: { "cache-control": "no-store" } });
}
