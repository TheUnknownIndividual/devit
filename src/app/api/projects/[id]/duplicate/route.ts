import { NextResponse } from "next/server";
import { saveProject } from "@/lib/store";
import { copyUploads } from "@/lib/uploads";
import { displayName, newId, type Project } from "@/lib/spec";
import { ensureAnon } from "@/lib/accounts";
import { editable } from "@/lib/access";

/** A copy to try a different direction: same site, chat and pictures, unpublished, owned by whoever made the copy. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const { p, v } = g;
  if (p.status === "building") return NextResponse.json({ error: "Wait for the build to finish first." }, { status: 409 });
  const nid = newId(12);
  // Picture urls name the project they belong to.
  const copy = JSON.parse(JSON.stringify(p).replaceAll(`/api/assets/${p.id}/`, `/api/assets/${nid}/`)) as Project;
  const now = Date.now();
  Object.assign(copy, { id: nid, slug: "", name: `${displayName(p)} copy`.slice(0, 60), createdAt: now, published: null, publishedSpec: undefined });
  if (v.user) { copy.ownerId = v.user.id; delete copy.anon; }
  else if (p.anon) copy.anon = await ensureAnon();
  await copyUploads(p.id, nid);
  await saveProject(copy);
  return NextResponse.json({ id: nid });
}
