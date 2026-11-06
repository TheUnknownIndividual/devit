import { NextResponse } from "next/server";
import { editable } from "@/lib/access";
import { checkSite } from "@/lib/safety";

// The pre-publish check for the builder's Publish dialog (lib/safety.ts): reads the spec, fetches nothing.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  return NextResponse.json(checkSite(g.p), { headers: { "cache-control": "no-store" } });
}
