import { NextResponse } from "next/server";
import { updateProject } from "@/lib/store";
import { newId } from "@/lib/spec";
import { publicProject } from "@/lib/public";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await updateProject(id, (q) => {
    const prev = q.history.pop();
    if (!prev) return;
    q.spec = prev;
    q.version += 1;
    q.messages.push({ id: newId(), role: "agent", text: "Undid the last change.", at: Date.now() });
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicProject(p));
}
