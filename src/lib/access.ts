import { viewer, type Viewer } from "./accounts";
import { teamActive } from "./entitlements";
import { getProject, listProjects } from "./store";
import { getTeam, roleIn } from "./teams";
import type { Project } from "./spec";

// Who may do what with a project. Its own account (or the anonymous browser that made it) owns it; in a team the
// team's owner and editors edit too, viewers only look. A lapsed team leaves every member looking, nothing deleted.

export type Access = "owner" | "editor" | "viewer";
type Guarded = Pick<Project, "ownerId" | "anon" | "teamId">;

/** Projects without owner or anonymous id were made before accounts existed: open to the local dev only. */
const legacyOpen = () => process.env.NODE_ENV !== "production";

export async function accessTo(p: Guarded, v: Viewer): Promise<Access | null> {
  if (p.ownerId ? v.user?.id === p.ownerId : p.anon ? !!v.anon && v.anon === p.anon : legacyOpen()) return "owner";
  if (!p.teamId || !v.user) return null;
  const t = await getTeam(p.teamId);
  const r = roleIn(t, v.user.id);
  if (!t || !r) return null;
  return (await teamActive(t)) ? r : "viewer";
}

export const canEdit = async (p: Guarded, v: Viewer) => { const a = await accessTo(p, v); return a === "owner" || a === "editor"; };

export const forbidden = (viewOnly = false) => Response.json({ error: viewOnly ? "You can view this project but not change it." : "This project belongs to another account." }, { status: 403 });

/**
 * For routes that change a project: the project, viewer and access when this viewer may edit it (or, with "owner",
 * delete it), else the error response.
 */
export async function editable(id: string, need: "edit" | "owner" = "edit"): Promise<{ p: Project; v: Viewer; access: Access } | Response> {
  const p = await getProject(id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  const v = await viewer();
  const access = await accessTo(p, v);
  const ok = need === "owner" ? access === "owner" : access === "owner" || access === "editor";
  return ok && access ? { p, v, access } : forbidden(!!access);
}

/**
 * The projects in a workspace: one team's, or personal (this viewer's own outside any team, and their own still
 * filed under a team they've since left).
 */
export async function myProjects(v: Viewer, teamId?: string): Promise<Array<{ p: Project; access: Access }>> {
  const out: Array<{ p: Project; access: Access }> = [];
  const inTeam = new Map<string, boolean>();
  for (const p of await listProjects(500)) {
    if (teamId ? p.teamId !== teamId : p.teamId && v.user?.id !== p.ownerId) continue;
    if (!teamId && p.teamId) {
      if (!inTeam.has(p.teamId)) inTeam.set(p.teamId, !!roleIn(await getTeam(p.teamId), v.user?.id));
      if (inTeam.get(p.teamId)) continue;
    }
    const access = await accessTo(p, v);
    if (access) out.push({ p, access });
  }
  return out;
}
