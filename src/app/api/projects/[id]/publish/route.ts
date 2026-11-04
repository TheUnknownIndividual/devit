import { NextResponse } from "next/server";
import { z } from "zod";
import { slugTaken, updateProject } from "@/lib/store";
import { newId } from "@/lib/spec";
import { publicProject } from "@/lib/public";
import { RESERVED_SLUGS as RESERVED, siteUrl } from "@/lib/sites";

const Body = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/) });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slug = new URL(req.url).searchParams.get("slug")?.toLowerCase() ?? "";
  const ok = Body.safeParse({ slug }).success && !RESERVED.has(slug) && !(await slugTaken(slug, id));
  return NextResponse.json({ available: ok });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use 3–32 letters, numbers or dashes." }, { status: 400 });
  const { slug } = parsed.data;
  if (RESERVED.has(slug) || (await slugTaken(slug, id))) return NextResponse.json({ error: "That address is taken." }, { status: 409 });
  const p = await updateProject(id, (q) => {
    q.slug = slug;
    const first = !q.published;
    q.published = { slug, at: Date.now() };
    if (q.spec) q.publishedSpec = structuredClone(q.spec);
    q.messages.push({ id: newId(), role: "agent", text: first ? `Published at ${siteUrl(slug)}.` : `Updated the live site at ${siteUrl(slug)}.`, at: Date.now() });
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicProject(p));
}
