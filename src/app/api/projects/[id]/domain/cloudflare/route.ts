import { NextResponse } from "next/server";
import { z } from "zod";
import { editable } from "@/lib/access";
import { customTarget } from "@/lib/domains";
import { overLimit } from "@/lib/net";
import { cfPoint, cfZoneFor } from "@/lib/cloudflare-dns";

// One click for a domain on Cloudflare DNS: the team pastes a token (Zone → DNS → Edit) and we add the records.
// The token lives only for this request.

const Body = z.object({ token: z.string().trim().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/, "That doesn't look like a Cloudflare API token.") });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "cloudflare-dns", 20);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const d = g.p.domain;
  const target = customTarget();
  if (!d || !target) return NextResponse.json({ error: "Add the domain above first." }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Paste the API token." }, { status: 400 });
  const zone = await cfZoneFor(parsed.data.token, d.host);
  if ("error" in zone) return NextResponse.json({ error: zone.error }, { status: 400 });
  const w = await cfPoint(parsed.data.token, zone.id, d.host, d.token, target, d.cf?.txt);
  if ("error" in w) return NextResponse.json({ error: w.error }, { status: 502 });
  return NextResponse.json({ ok: true, zone: zone.name, replaced: w.replaced });
}
