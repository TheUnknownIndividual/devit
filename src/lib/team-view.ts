import { getUser, initialOf, viewer, type User } from "./accounts";
import { teamActive, teamSeats } from "./entitlements";
import { getTeam, live, roleIn, seatsUsed, type Role, type Team } from "./teams";

// What a member's browser sees of a team: names, roles and seats. Invite token hashes never leave the server; the
// open invites are listed to the owner only.

export async function teamView(t: Team, me: User) {
  const role = roleIn(t, me.id)!;
  const members = await Promise.all(t.members.map(async (m) => {
    const u = await getUser(m.userId);
    return { userId: m.userId, role: m.role, joinedAt: m.joinedAt, name: u?.name || u?.email || u?.methods[0]?.label || "Former account", email: u?.email ?? null, initial: u ? initialOf(u) : "?" };
  }));
  return {
    id: t.id, name: t.name, ownerId: t.ownerId, createdAt: t.createdAt, role, active: await teamActive(t),
    seats: { used: seatsUsed(t), limit: await teamSeats(t) },
    members,
    invites: role === "owner" ? live(t).map((i) => ({ id: i.id, email: i.email ?? null, role: i.role, expiresAt: i.expiresAt })) : [],
  };
}
export type TeamView = Awaited<ReturnType<typeof teamView>>;

/** For team routes: the signed-in member and the team, when they hold one of these roles; else the error response. */
export async function teamFor(id: string, roles: Role[] = ["owner"]): Promise<{ t: Team; me: User } | Response> {
  const { user } = await viewer();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const t = await getTeam(id).catch(() => null);
  const r = roleIn(t, user.id);
  if (!t || !r) return Response.json({ error: "not found" }, { status: 404 });
  if (!roles.includes(r)) return Response.json({ error: "Only the team's owner can do that." }, { status: 403 });
  return { t, me: user };
}

/** This app's own origin for links in emails, from the request (the proxy's forwarded host when there is one). */
export function originOf(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
