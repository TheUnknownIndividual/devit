import { NextResponse } from "next/server";
import { z } from "zod";
import { viewer } from "@/lib/accounts";
import { entitled, needsPlan } from "@/lib/entitlements";
import { createTeam, teamsOf } from "@/lib/teams";
import { teamView } from "@/lib/team-view";

const Body = z.object({ name: z.string().trim().min(1).max(60) });

export async function GET() {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const teams = await Promise.all((await teamsOf(user.id)).map((t) => teamView(t, user)));
  return NextResponse.json({ teams, canCreate: await entitled(user, "teams") }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await entitled(user, "teams"))) return needsPlan("teams");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the team a name (60 characters at most)." }, { status: 400 });
  if ((await teamsOf(user.id)).filter((t) => t.ownerId === user.id).length >= 10) return NextResponse.json({ error: "Ten teams per account at most." }, { status: 409 });
  return NextResponse.json({ team: await teamView(await createTeam(user.id, parsed.data.name), user) });
}
