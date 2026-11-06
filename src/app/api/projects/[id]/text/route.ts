import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProject } from "@/lib/store";
import { publicProject } from "@/lib/public";
import { editable } from "@/lib/access";
import { overLimit } from "@/lib/net";
import { snapshot } from "@/lib/history";
import type { SiteSpec } from "@/lib/spec";

// Typing straight into the preview: the old words are found in the block's own copy and swapped for the new ones.
// No model call. Words that come from live data or the token (prices, the ticker) aren't in the copy and are refused.

const Body = z.object({ blockId: z.string().max(40), before: z.string().max(2000), after: z.string().max(2000) });

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Replaces the first string in `v` that is (or holds) `before`. Returns whether one was found. */
function swap(v: unknown, before: string, after: string, set: (x: unknown) => void, loose: boolean): boolean {
  if (typeof v === "string") {
    if (squash(v) === before) { set(after); return true; }
    if (loose && v.includes(before)) { set(v.replace(before, after)); return true; }
    return false;
  }
  if (Array.isArray(v)) return v.some((x, i) => swap(x, before, after, (n) => { v[i] = n; }, loose));
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.keys(o).some((k) => !/^(id|href|url|src|image|icon|type|color)$/i.test(k) && swap(o[k], before, after, (n) => { o[k] = n; }, loose));
  }
  return false;
}

function edit(spec: SiteSpec, blockId: string, before: string, after: string): boolean {
  const b = spec.blocks.find((x) => x.id === blockId);
  if (!b) return false;
  if (swap(b.props, before, after, () => undefined, false) || swap(b.props, before, after, () => undefined, true)) return true;
  // The hero and nav show the site's own name and tagline when their copy doesn't set one.
  if (squash(spec.tagline) === before) { spec.tagline = after; return true; }
  if (squash(spec.name) === before) { spec.name = after; return true; }
  return false;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "edit", 200);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const before = squash(parsed.data.before), after = squash(parsed.data.after);
  if (!before || !after) return NextResponse.json({ error: "Type some words, or ask in chat to remove it." }, { status: 400 });
  if (before === after) return NextResponse.json(publicProject(g.p));
  if (!g.p.spec) return NextResponse.json({ error: "not ready" }, { status: 409 });
  const trial = structuredClone(g.p.spec);
  if (!edit(trial, parsed.data.blockId, before, after)) {
    return NextResponse.json({ error: "That text comes from live data or the token, so it can't be typed over. Ask in chat instead." }, { status: 422 });
  }
  const p = await updateProject(id, (q) => {
    if (!q.spec) return;
    snapshot(q, `Text edit: “${before.slice(0, 40)}” → “${after.slice(0, 40)}”`);
    edit(q.spec, parsed.data.blockId, before, after);
    q.version += 1;
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicProject(p));
}
