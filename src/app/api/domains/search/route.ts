import { NextResponse } from "next/server";
import { overLimit } from "@/lib/net";
import { buyingOn, domainFee, searchDomains, searchOn } from "@/lib/spaceship";

// Domain search for the builder's "Buy a domain": availability and our price (Spaceship's price plus our fee).

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 80) ?? "";
  if (!searchOn()) return NextResponse.json({ enabled: false, buying: false, offers: [] });
  if (!q.trim()) return NextResponse.json({ enabled: true, buying: buyingOn(), fee: domainFee(), offers: [] });
  const limited = overLimit(req, "domain-search", 60);
  if (limited) return limited;
  const r = await searchDomains(q);
  if ("error" in r) return NextResponse.json({ enabled: true, buying: buyingOn(), error: r.error, offers: [] }, { status: 400 });
  return NextResponse.json({ enabled: true, buying: buyingOn(), fee: domainFee(), offers: r.offers }, { headers: { "cache-control": "no-store" } });
}
