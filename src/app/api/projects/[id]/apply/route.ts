import { NextResponse } from "next/server";
import { z } from "zod";
import { applyComments } from "@/lib/agent";
import { updateProject } from "@/lib/store";
import { newId } from "@/lib/spec";
import { publicProject } from "@/lib/public";
import { overLimit } from "@/lib/net";
import { editable, ownerKeysFor } from "@/lib/accounts";
import { runWithKeys } from "@/lib/keyscope";
import { projectEntitled } from "@/lib/entitlements";

const Body = z.object({
  comments: z.array(z.object({
    id: z.string().max(40),
    blockId: z.string().max(40),
    blockLabel: z.string().max(60),
    element: z.string().max(120).optional(),
    text: z.string().trim().min(1).max(500),
    assets: z.array(z.string().max(24)).max(6).optional(),
  })).min(1).max(30),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "edit", 80);
  if (limited) return limited;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a comment first." }, { status: 400 });
  const g = await editable(id);
  if (g instanceof Response) return g;
  const { p } = g;
  if (!p.spec) return NextResponse.json({ error: "not ready" }, { status: 409 });
  const own = new Set((p.assets ?? []).map((a) => a.id));
  const comments = parsed.data.comments.map((c) => ({ ...c, assets: c.assets?.filter((a) => own.has(a)) }));
  const urls = (p.assets ?? []).filter((a) => comments.some((c) => c.assets?.includes(a.id))).map((a) => a.url);
  const res = await runWithKeys(await ownerKeysFor(p.ownerId), () => applyComments(p, comments), await projectEntitled(p, "priorityModels"));
  const out = await updateProject(id, (q) => {
    if (!q.spec) return;
    q.history.push(structuredClone(q.spec));
    if (q.history.length > 30) q.history.shift();
    q.spec = res.spec;
    q.version += 1;
    const list = comments.map((c) => `${c.blockLabel}: ${c.text}`).join("\n");
    q.messages.push({ id: newId(), role: "user", text: list, at: Date.now(), ...(urls.length ? { assets: urls } : {}) });
    q.messages.push({ id: newId(), role: "agent", text: res.message, at: Date.now(), via: res.via });
  });
  return NextResponse.json(out ? publicProject(out) : { error: "not found" });
}
