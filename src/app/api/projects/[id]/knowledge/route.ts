import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProject } from "@/lib/store";
import { publicProject } from "@/lib/public";
import { editable } from "@/lib/access";

const Body = z.object({ knowledge: z.string().max(2000) });

/** Standing instructions the agent reads on every change (tone, words to avoid, links to always use). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Keep it under 2,000 characters." }, { status: 400 });
  const p = await updateProject(id, (q) => { q.knowledge = parsed.data.knowledge.trim() || undefined; });
  return p ? NextResponse.json(publicProject(p)) : NextResponse.json({ error: "not found" }, { status: 404 });
}
