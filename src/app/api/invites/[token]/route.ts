import { NextResponse } from "next/server";
import { viewer } from "@/lib/accounts";
import { teamSeats } from "@/lib/entitlements";
import { inviteByToken, roleIn, updateTeam } from "@/lib/teams";

/** Joins the team the link is for. The link works once; someone already in the team keeps their role. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const found = await inviteByToken((await ctx.params).token);
  if (!found) return NextResponse.json({ error: "This invite has expired or was already used. Ask for a new one." }, { status: 404 });
  const { team, invite } = found;
  if (roleIn(team, user.id)) return NextResponse.json({ teamId: team.id, already: true });
  const limit = await teamSeats(team);
  let error: string | null = null;
  await updateTeam(team.id, (t) => {
    const i = t.invites.find((x) => x.tokenHash === invite.tokenHash && x.expiresAt > Date.now());
    if (!i) { error = "This invite has expired or was already used. Ask for a new one."; return; }
    // The invite already holds a seat; this only guards a team that shrank since.
    if (t.members.length >= limit) { error = `${t.name} has no free seats.`; return; }
    t.invites = t.invites.filter((x) => x !== i);
    t.members.push({ userId: user.id, role: i.role, joinedAt: Date.now() });
  });
  return error ? NextResponse.json({ error }, { status: 409 }) : NextResponse.json({ teamId: team.id });
}
