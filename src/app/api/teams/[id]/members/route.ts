import { NextResponse } from "next/server";
import { z } from "zod";
import { updateTeam } from "@/lib/teams";
import { teamFor, teamView } from "@/lib/team-view";

const Patch = z.object({ userId: z.string().max(40), role: z.enum(["editor", "viewer"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await teamFor((await ctx.params).id);
  if (g instanceof Response) return g;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const { userId, role } = parsed.data;
  if (userId === g.t.ownerId) return NextResponse.json({ error: "The owner stays the owner." }, { status: 409 });
  const t = await updateTeam(g.t.id, (t) => { for (const m of t.members) if (m.userId === userId) m.role = role; });
  return t ? NextResponse.json({ team: await teamView(t, g.me) }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

/** The owner removes someone, or a member leaves (?userId= their own id). Their own projects stay theirs. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await teamFor((await ctx.params).id, ["owner", "editor", "viewer"]);
  if (g instanceof Response) return g;
  const userId = new URL(req.url).searchParams.get("userId") ?? g.me.id;
  if (userId === g.t.ownerId) return NextResponse.json({ error: "The owner can't leave. Delete the team instead." }, { status: 409 });
  if (userId !== g.me.id && g.me.id !== g.t.ownerId) return NextResponse.json({ error: "Only the team's owner can do that." }, { status: 403 });
  const t = await updateTeam(g.t.id, (t) => { t.members = t.members.filter((m) => m.userId !== userId); });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(userId === g.me.id ? { ok: true } : { team: await teamView(t, g.me) });
}
