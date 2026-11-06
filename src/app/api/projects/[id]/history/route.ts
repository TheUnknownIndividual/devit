import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject, updateProject } from "@/lib/store";
import { newId } from "@/lib/spec";
import { publicProject } from "@/lib/public";
import { editable } from "@/lib/access";
import { canRead } from "@/lib/site-access";
import { restoreVersion } from "@/lib/history";

/** One saved version's spec, for previewing it in the builder before restoring. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getProject(id).catch(() => null);
  if (!p || !(await canRead(p, undefined, new URL(req.url).searchParams.get("share")))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const i = Number(new URL(req.url).searchParams.get("i"));
  const spec = Number.isInteger(i) ? p.history[i] : undefined;
  if (!spec) return NextResponse.json({ error: "That version is gone." }, { status: 404 });
  return NextResponse.json({ spec }, { headers: { "cache-control": "no-store" } });
}

const Body = z.object({ i: z.number().int().min(0).max(100) });

/** Restores a saved version; the current one is saved first. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a version." }, { status: 400 });
  let ok = false;
  const p = await updateProject(id, (q) => {
    ok = restoreVersion(q, parsed.data.i);
    if (ok) q.messages.push({ id: newId(), role: "agent", text: "Restored that version. The one before it is saved in history too.", at: Date.now() });
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!ok) return NextResponse.json({ error: "That version is gone." }, { status: 404 });
  return NextResponse.json(publicProject(p));
}
