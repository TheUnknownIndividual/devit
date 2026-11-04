import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { listProjects, updateProject } from "./store";
import { sha256, token } from "./secrets";

// Team workspaces as JSON files next to the accounts: teams/<id>.json holds the members and pending invites.
// Invite links carry a random token; only its SHA-256 is kept, and it's taken once. Projects join a team by teamId.

const DIR = path.join(process.cwd(), "data", "accounts", "teams");
export const INVITE_DAYS = 7;

export type Role = "owner" | "editor" | "viewer";
export interface Member { userId: string; role: Role; joinedAt: number }
export interface Invite { id: string; tokenHash: string; email?: string; role: Exclude<Role, "owner">; expiresAt: number; by: string; at: number }
export interface Team { id: string; name: string; ownerId: string; createdAt: number; members: Member[]; invites: Invite[] }

const file = (id: string) => { if (!/^[A-Za-z0-9]{8,32}$/.test(id)) throw new Error("bad team id"); return path.join(DIR, `${id}.json`); };
const locks = new Map<string, Promise<unknown>>();
const newTeamId = () => token(12).replace(/[^A-Za-z0-9]/g, "").slice(0, 14).padEnd(14, "x");

export async function getTeam(id: string | undefined): Promise<Team | null> {
  if (!id) return null;
  try { return JSON.parse(await readFile(file(id), "utf8")) as Team; } catch { return null; }
}

async function save(t: Team): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const f = file(t.id);
  const tmp = `${f}.${process.pid}.${token(4)}.tmp`;
  await writeFile(tmp, JSON.stringify(t), { mode: 0o600 });
  await rename(tmp, f);
}

export async function updateTeam(id: string, fn: (t: Team) => void | Promise<void>): Promise<Team | null> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const t = await getTeam(id);
    if (!t) return null;
    await fn(t);
    await save(t);
    return t;
  });
  locks.set(id, next.catch(() => undefined));
  return next;
}

async function allTeams(): Promise<Team[]> {
  try {
    const names = (await readdir(DIR)).filter((n) => n.endsWith(".json"));
    return (await Promise.all(names.map((n) => getTeam(n.slice(0, -5))))).filter((t): t is Team => !!t);
  } catch { return []; }
}

/** Every team this account is in, oldest first. */
export const teamsOf = async (userId: string) => (await allTeams()).filter((t) => t.members.some((m) => m.userId === userId)).sort((a, b) => a.createdAt - b.createdAt);

export const roleIn = (t: Team | null, userId: string | undefined): Role | null => (userId && t?.members.find((m) => m.userId === userId)?.role) || null;

/** Members plus invites still open: both hold a seat. */
export const live = (t: Team) => t.invites.filter((i) => i.expiresAt > Date.now());
export const seatsUsed = (t: Team) => t.members.length + live(t).length;

export async function createTeam(ownerId: string, name: string): Promise<Team> {
  const now = Date.now();
  const t: Team = { id: newTeamId(), name, ownerId, createdAt: now, members: [{ userId: ownerId, role: "owner", joinedAt: now }], invites: [] };
  await save(t);
  return t;
}

/** Deletes the team; its projects go back to their owners' personal workspaces. */
export async function deleteTeam(id: string): Promise<void> {
  for (const p of await listProjects(5000)) if (p.teamId === id) await updateProject(p.id, (q) => { if (q.teamId === id) delete q.teamId; });
  const prev = locks.get(id) ?? Promise.resolve();
  await prev;
  await rm(file(id), { force: true });
  locks.delete(id);
}

/** A new invite and the one link that redeems it. Expired invites are dropped on the way. */
export async function addInvite(id: string, by: string, role: Invite["role"], email?: string): Promise<{ team: Team; invite: Invite; token: string } | null> {
  const t = token(24);
  const invite: Invite = { id: token(6).replace(/[^A-Za-z0-9]/g, "x"), tokenHash: sha256(t), role, by, at: Date.now(), expiresAt: Date.now() + INVITE_DAYS * 86_400_000, ...(email ? { email } : {}) };
  const team = await updateTeam(id, (x) => { x.invites = [...live(x), invite]; });
  return team ? { team, invite, token: t } : null;
}

/** The team and invite a link is for, while it's open. */
export async function inviteByToken(t: string): Promise<{ team: Team; invite: Invite } | null> {
  if (!t || t.length > 100) return null;
  const h = sha256(t);
  for (const team of await allTeams()) {
    const invite = live(team).find((i) => i.tokenHash === h);
    if (invite) return { team, invite };
  }
  return null;
}
