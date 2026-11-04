import { NextResponse } from "next/server";
import { z } from "zod";
import { accessTo } from "@/lib/access";
import { viewer } from "@/lib/accounts";
import { getProject, updateProject } from "@/lib/store";
import { getTeam, roleIn } from "@/lib/teams";

const Body = z.object({ teamId: z.string().max(40).nullable() });

/**
 * Files a project under a team or back under its owner. In: the project's owner, who is the team's owner or an
 * editor. Out: the project's owner, or the team's owner (it goes back to whoever made it).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const p = await getProject(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const v = await viewer();
  if (!v.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const mine = p.ownerId === v.user.id;
  const { teamId } = parsed.data;
  if (teamId) {
    const r = roleIn(await getTeam(teamId), v.user.id);
    if (!mine) return NextResponse.json({ error: "Only the project's owner can move it." }, { status: 403 });
    if (r !== "owner" && r !== "editor") return NextResponse.json({ error: "You need to be an owner or editor of that team." }, { status: 403 });
  } else if (!mine && !(p.teamId && (await getTeam(p.teamId))?.ownerId === v.user.id)) {
    return NextResponse.json({ error: (await accessTo(p, v)) ? "Only the project's owner or the team's owner can move it out." : "This project belongs to another account." }, { status: 403 });
  }
  await updateProject(id, (q) => { if (teamId) q.teamId = teamId; else delete q.teamId; });
  return NextResponse.json({ ok: true, teamId });
}
