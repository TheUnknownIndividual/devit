import { NextResponse } from "next/server";
import { accessTo } from "@/lib/access";
import { viewer } from "@/lib/accounts";
import { getProject } from "@/lib/store";
import { visitSummary } from "@/lib/visits";

// Visit counts for a published site (lib/visits.ts), for anyone who can open the project, editors and viewers alike.
// ?days= picks the window, 1 to 90, default 30.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getProject(id).catch(() => null);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await accessTo(p, await viewer()))) return NextResponse.json({ error: "This project belongs to another account." }, { status: 403 });
  const n = Number(new URL(req.url).searchParams.get("days") ?? 30);
  return NextResponse.json(await visitSummary(id, Number.isFinite(n) ? n : 30), { headers: { "cache-control": "no-store" } });
}
