import { NextResponse } from "next/server";
import { z } from "zod";
import { overLimit } from "@/lib/net";
import { enhancePrompt } from "@/lib/enhance";
import { getProject } from "@/lib/store";
import { canRead } from "@/lib/site-access";

const Body = z.object({ text: z.string().trim().min(3).max(1200), projectId: z.string().max(40).optional() });

/** Enhance prompt: a clearer version of what was typed, landing page (new site) or builder (a change). */
export async function POST(req: Request) {
  const limited = overLimit(req, "enhance", 40);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a few words first." }, { status: 400 });
  const { text, projectId } = parsed.data;
  const p = projectId ? await getProject(projectId) : null;
  const ok = p ? await canRead(p) : false;
  const r = await enhancePrompt(text, projectId ? "change" : "new", ok ? p : null);
  if ("error" in r) return NextResponse.json(r, { status: 503 });
  return NextResponse.json(r);
}
