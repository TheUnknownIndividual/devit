import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, overLimit } from "@/lib/net";
import { metered, payerFor } from "@/lib/credits";
import { viewer } from "@/lib/accounts";
import { enhancePrompt } from "@/lib/enhance";
import { getProject } from "@/lib/store";
import { canRead } from "@/lib/site-access";
import { findLeaks } from "@/lib/leaks";

const Body = z.object({ text: z.string().trim().min(3).max(1200), projectId: z.string().max(40).optional() });

/** Enhance prompt: a clearer version of what was typed, landing page (new site) or builder (a change). */
export async function POST(req: Request) {
  const limited = overLimit(req, "enhance", 40);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a few words first." }, { status: 400 });
  const { text, projectId } = parsed.data;
  // Leak firewall: never send a key to the model, even to tidy the wording.
  const leaks = [...new Set(findLeaks(text).map((l) => l.kind))];
  if (leaks.length) return NextResponse.json({ error: `That has ${leaks.join(" and ")} in it. Take it out first: keys never go to the model.` }, { status: 400 });
  const p = projectId ? await getProject(projectId) : null;
  const ok = p ? await canRead(p) : false;
  // Charged to whoever's typing (it runs on our small model); out of credits, it's simply not offered.
  const { user } = await viewer();
  const m = await metered(await payerFor(user, clientIp(req)), "edit", false, () => enhancePrompt(text, projectId ? "change" : "new", ok ? p : null));
  if ("refused" in m) return m.refused;
  const r = m.value;
  if ("error" in r) return NextResponse.json(r, { status: 503 });
  return NextResponse.json(r);
}
