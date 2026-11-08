import { NextResponse } from "next/server";
import { z } from "zod";
import { findLeaks } from "@/lib/leaks";
import { applyComments } from "@/lib/agent";
import { updateProject } from "@/lib/store";
import { newId } from "@/lib/spec";
import { publicProject } from "@/lib/public";
import { snapshot } from "@/lib/history";
import { clientIp, isOperator, overLimit } from "@/lib/net";
import { metered, operatorPayer, payerForProject } from "@/lib/credits";
import { ownerKeysFor } from "@/lib/accounts";
import { editable } from "@/lib/access";
import { hasOwnLlm, runWithKeys } from "@/lib/keyscope";
import { modelFrom } from "@/lib/models";
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
  // Leak firewall: a comment with a key in it isn't sent to the model.
  const leaks = [...new Set(parsed.data.comments.flatMap((c) => findLeaks(c.text).map((l) => l.kind)))];
  if (leaks.length) return NextResponse.json({ error: `A comment has ${leaks.join(" and ")} in it. Take it out first: keys never go to the model or into a site.` }, { status: 400 });
  const g = await editable(id);
  if (g instanceof Response) return g;
  const { p } = g;
  if (!p.spec) return NextResponse.json({ error: "not ready" }, { status: 409 });
  const own = new Set((p.assets ?? []).map((a) => a.id));
  const comments = parsed.data.comments.map((c) => ({ ...c, assets: c.assets?.filter((a) => own.has(a)) }));
  const urls = (p.assets ?? []).filter((a) => comments.some((c) => c.assets?.includes(a.id))).map((a) => a.url);
  const keys = await ownerKeysFor(p.ownerId);
  const priority = await projectEntitled(p, "priorityModels");
  const m = await metered(isOperator(req) ? operatorPayer() : await payerForProject(p.ownerId, clientIp(req)), "edit", hasOwnLlm(keys), () => runWithKeys(keys, () => applyComments(p, comments), priority, modelFrom(req)));
  if ("refused" in m) return m.refused;
  const res = m.value;
  const out = await updateProject(id, (q) => {
    if (!q.spec) return;
    snapshot(q, comments.map((c) => `${c.blockLabel}: ${c.text}`).join("; "));
    q.spec = res.spec;
    q.version += 1;
    const list = comments.map((c) => `${c.blockLabel}: ${c.text}`).join("\n");
    q.messages.push({ id: newId(), role: "user", text: list, at: Date.now(), ...(urls.length ? { assets: urls } : {}) });
    q.messages.push({ id: newId(), role: "agent", text: res.message, at: Date.now(), via: res.via });
  });
  return NextResponse.json(out ? publicProject(out) : { error: "not found" });
}
