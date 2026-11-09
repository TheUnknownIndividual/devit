import { NextResponse } from "next/server";
import { viewer } from "@/lib/accounts";
import { catalogFor } from "@/lib/model-catalog";
import { overLimit } from "@/lib/net";

// The model catalog behind the chat box's "More models" (lib/model-catalog.ts).
export async function GET(req: Request) {
  const limited = overLimit(req, "model-catalog", 30);
  if (limited) return limited;
  const { user } = await viewer();
  return NextResponse.json({ models: await catalogFor(user?.id) }, { headers: { "cache-control": "private, max-age=60" } });
}
