import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProject } from "@/lib/store";
import { editable } from "@/lib/access";
import { needsPlan, projectEntitled } from "@/lib/entitlements";
import { cfRemove, claimedElsewhere, customTarget, domainView, guessApex, isApex, newDomain, normalizeDomain } from "@/lib/domains";
import { syncRouting } from "@/lib/routing";

// The project's custom domain: read it with the records to add, set or replace it, remove it.

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const entitled = await projectEntitled(g.p, "customDomain");
  if (!entitled && !g.p.domain) return needsPlan("customDomain");
  return NextResponse.json(await domainView(g.p, entitled), { headers: { "cache-control": "no-store" } });
}

const Body = z.object({ domain: z.string().max(300) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  if (!(await projectEntitled(g.p, "customDomain"))) return needsPlan("customDomain");
  if (!customTarget()) return NextResponse.json({ error: "Custom domains aren't set up on this server yet (CUSTOM_DOMAIN_TARGET or SITES_DOMAIN)." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a domain." }, { status: 400 });
  const n = normalizeDomain(parsed.data.domain);
  if ("error" in n) return NextResponse.json({ error: n.error }, { status: 400 });
  if (await claimedElsewhere(n.host, id)) return NextResponse.json({ error: "That domain is already connected to another site." }, { status: 409 });
  const same = g.p.domain?.host === n.host;
  const apex = same ? g.p.domain!.apex : ((await isApex(n.host)) ?? guessApex(n.host));
  const oldCf = !same ? g.p.domain?.cf?.id : undefined;
  const p = await updateProject(id, (q) => { if (!same) q.domain = newDomain(n.host, apex); });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (oldCf) await cfRemove(oldCf);
  await syncRouting(p);
  return NextResponse.json(await domainView(p, true));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const cf = g.p.domain?.cf?.id;
  const p = await updateProject(id, (q) => { q.domain = undefined; });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (cf) await cfRemove(cf);
  await syncRouting(p);
  return NextResponse.json(await domainView(p, await projectEntitled(p, "customDomain")));
}
