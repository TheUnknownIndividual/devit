import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProject } from "@/lib/store";
import { editable } from "@/lib/accounts";
import { needsPlan, projectEntitled } from "@/lib/entitlements";
import { hashPassword, newAccessKey } from "@/lib/access";
import { syncRouting } from "@/lib/routing";
import { siteUrl } from "@/lib/sites";
import type { Project } from "@/lib/spec";

// Who may open the published site. Public is always allowed (it's how a lapsed plan opts back out); a private link
// or a password is Pro. The link is shown to the owner only.

const view = (p: Project, entitled: boolean) => ({
  mode: p.access?.mode ?? "public",
  link: p.access?.mode === "link" && p.access.key && p.published ? `${siteUrl(p.published.slug)}?k=${p.access.key}` : null,
  hasPassword: !!p.access?.pass,
  published: !!p.published,
  entitled,
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const entitled = await projectEntitled(g.p, "privateSites");
  if (!entitled && !g.p.access) return needsPlan("privateSites");
  return NextResponse.json(view(g.p, entitled), { headers: { "cache-control": "no-store" } });
}

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("public") }),
  z.object({ mode: z.literal("link"), rotate: z.boolean().optional() }),
  z.object({ mode: z.literal("password"), password: z.string().min(6, "Use at least 6 characters.").max(128).optional() }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad input" }, { status: 400 });
  const b = parsed.data;
  const entitled = await projectEntitled(g.p, "privateSites");
  if (b.mode !== "public" && !entitled) return needsPlan("privateSites");
  if (b.mode === "password" && !b.password && !(g.p.access?.mode === "password" && g.p.access.pass)) return NextResponse.json({ error: "Set a password." }, { status: 400 });
  const pass = b.mode === "password" && b.password ? await hashPassword(b.password) : null;
  const p = await updateProject(id, (q) => {
    const was = q.access;
    if (b.mode === "public") q.access = undefined;
    else if (b.mode === "link") q.access = { mode: "link", key: was?.mode === "link" && was.key && !b.rotate ? was.key : newAccessKey(), at: Date.now() };
    else q.access = { mode: "password", pass: pass ?? was!.pass, at: Date.now() };
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  await syncRouting(p);
  return NextResponse.json(view(p, entitled));
}
