import { NextResponse } from "next/server";
import { z } from "zod";
import { editable } from "@/lib/access";
import { customTarget } from "@/lib/domains";
import { overLimit } from "@/lib/net";
import { pointingRecords, writeRecords, zoneFor } from "@/lib/spaceship";

// "Set it up for me" for a domain the team already has on Spaceship: they paste an API key and secret (Domains: read,
// DNS records: write) and we add the records the Custom domain section lists. The key is used for this call only.

const Body = z.object({ key: z.string().trim().min(8).max(200), secret: z.string().trim().min(8).max(300) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "spaceship-dns", 20);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const d = g.p.domain;
  const target = customTarget();
  if (!d || !target) return NextResponse.json({ error: "Add the domain above first." }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the API key and the secret." }, { status: 400 });
  const k = parsed.data;
  const zone = await zoneFor(k, d.host);
  if (zone && typeof zone === "object") return NextResponse.json({ error: zone.error }, { status: 400 });
  if (!zone) return NextResponse.json({ error: `${d.host} isn't on that Spaceship account.` }, { status: 404 });
  const w = await writeRecords(k, zone, pointingRecords(d.host, zone, d.token, target, d.cf?.txt));
  if ("error" in w) return NextResponse.json({ error: w.error }, { status: 502 });
  return NextResponse.json({ ok: true, zone });
}
