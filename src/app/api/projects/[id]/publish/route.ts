import { NextResponse } from "next/server";
import { z } from "zod";
import { slugTaken, updateProject } from "@/lib/store";
import { newId } from "@/lib/spec";
import { publicProject } from "@/lib/public";
import { RESERVED_SLUGS as RESERVED, siteUrl } from "@/lib/sites";
import { editable } from "@/lib/access";
import { syncRouting } from "@/lib/routing";
import { appOrigin, pingIndexNow } from "@/lib/seo";
import { isPrivateSite } from "@/lib/site-access";
import { checkSite } from "@/lib/safety";

const Body = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/) });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slug = new URL(req.url).searchParams.get("slug")?.toLowerCase() ?? "";
  const ok = Body.safeParse({ slug }).success && !RESERVED.has(slug) && !(await slugTaken(slug, id));
  return NextResponse.json({ available: ok });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use 3–32 letters, numbers or dashes." }, { status: 400 });
  const { slug } = parsed.data;
  if (RESERVED.has(slug) || (await slugTaken(slug, id))) return NextResponse.json({ error: "That address is taken." }, { status: 409 });
  // A key or token on the page would go public with it: refuse until it's gone.
  const secret = checkSite(g.p).findings.find((f) => f.blocks);
  if (secret) return NextResponse.json({ error: `Not published: ${secret.title.charAt(0).toLowerCase()}${secret.title.slice(1)}. Ask the chat to take it out, then publish.`, safety: true }, { status: 422 });
  const p = await updateProject(id, (q) => {
    q.slug = slug;
    const first = !q.published;
    q.published = { slug, at: Date.now() };
    if (q.spec) q.publishedSpec = structuredClone(q.spec);
    q.messages.push({ id: newId(), role: "agent", text: first ? `Published at ${siteUrl(slug)}.` : `Updated the live site at ${siteUrl(slug)}.`, at: Date.now() });
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  await syncRouting(p);
  // Tell IndexNow engines (Bing, Yandex, Seznam, Naver) the site is new or changed; Google reads our sitemap.
  const url = siteUrl(slug);
  if (/^https:/.test(url) && !isPrivateSite(p) && !p.publishedSpec?.token?.demo) pingIndexNow([url, `${appOrigin()}/sitemap.xml`]);
  return NextResponse.json(publicProject(p));
}
