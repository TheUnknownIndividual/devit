import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteTeam, updateTeam } from "@/lib/teams";
import { teamFor, teamView } from "@/lib/team-view";

const Patch = z.object({ name: z.string().trim().min(1).max(60) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await teamFor((await ctx.params).id);
  if (g instanceof Response) return g;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Names are 1–60 characters." }, { status: 400 });
  const t = await updateTeam(g.t.id, (t) => { t.name = parsed.data.name; });
  return t ? NextResponse.json({ team: await teamView(t, g.me) }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

/** Deletes the team. Its projects stay, back in each owner's personal workspace. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await teamFor((await ctx.params).id);
  if (g instanceof Response) return g;
  await deleteTeam(g.t.id);
  return NextResponse.json({ ok: true });
}
