import { NextResponse } from "next/server";
import { z } from "zod";
import { findLeaks, redactLeaks } from "@/lib/leaks";
import { overLimit } from "@/lib/net";

// "Try the leak firewall" on /security: the same check every chat message and publish goes through. The text is
// answered and dropped: not stored, not logged, not sent anywhere.

const Body = z.object({ text: z.string().max(4000) });

export async function POST(req: Request) {
  const limited = overLimit(req, "leak-scan", 30);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Up to 4,000 characters." }, { status: 400 });
  const leaks = findLeaks(parsed.data.text).map((l) => ({ kind: l.kind, length: l.end - l.start }));
  const r = redactLeaks(parsed.data.text);
  return NextResponse.json({ text: r.text, removed: r.removed, leaks }, { headers: { "cache-control": "no-store" } });
}
