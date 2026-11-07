import { NextResponse } from "next/server";
import { z } from "zod";
import { needsPlan, teamActive, teamSeats } from "@/lib/entitlements";
import { sendMail } from "@/lib/mail";
import { overLimit } from "@/lib/net";
import { INVITE_DAYS, addInvite, seatsUsed, updateTeam } from "@/lib/teams";
import { originOf, teamFor, teamView } from "@/lib/team-view";

const Body = z.object({ role: z.enum(["editor", "viewer"]), email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(200)]).optional() });

/** A single-use invite link, good for a week. With an email it's also sent there when mail is set up. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "invite", 40);
  if (limited) return limited;
  const g = await teamFor((await ctx.params).id);
  if (g instanceof Response) return g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email, or leave it empty for a link." }, { status: 400 });
  if (!(await teamActive(g.t))) return needsPlan("teams");
  const limit = await teamSeats(g.t);
  if (seatsUsed(g.t) >= limit) return NextResponse.json({ error: `All ${limit} seats are taken. Remove a member or revoke an invite first.`, seats: true }, { status: 409 });
  const email = parsed.data.email || undefined;
  const out = await addInvite(g.t.id, g.me.id, parsed.data.role, email);
  if (!out) return NextResponse.json({ error: "not found" }, { status: 404 });
  const url = `${originOf(req)}/invite/${out.token}`;
  const who = g.me.name || g.me.email || "A teammate";
  const emailed = email ? await sendMail(email, `${who} invited you to ${g.t.name} on devit`, `${who} invited you to join ${g.t.name} on devit as ${out.invite.role === "editor" ? "an editor" : "a viewer"}.\n\nJoin here: ${url}\n\nThe link works once and for ${INVITE_DAYS} days.`) : null;
  return NextResponse.json({ url, emailed, team: await teamView(out.team, g.me) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await teamFor((await ctx.params).id);
  if (g instanceof Response) return g;
  const id = new URL(req.url).searchParams.get("id");
  const t = await updateTeam(g.t.id, (t) => { t.invites = t.invites.filter((i) => i.id !== id); });
  return t ? NextResponse.json({ team: await teamView(t, g.me) }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
