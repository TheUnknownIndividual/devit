import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { updateProject } from "@/lib/store";
import { publicProject } from "@/lib/public";
import { editable } from "@/lib/access";

// A view-only link to the builder: anyone with it sees the chat, history and preview, and can't change a thing.

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const p = await updateProject(id, (q) => { q.shareKey ??= randomBytes(12).toString("base64url"); });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...publicProject(p), shareUrl: `/build/${p.id}?share=${p.shareKey}` });
}

/** Turns the link off; anyone holding it loses access to a private project's builder. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const p = await updateProject(id, (q) => { q.shareKey = undefined; });
  return p ? NextResponse.json(publicProject(p)) : NextResponse.json({ error: "not found" }, { status: 404 });
}
