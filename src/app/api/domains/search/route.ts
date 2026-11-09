import { NextResponse } from "next/server";
import { overLimit } from "@/lib/net";
import { TLD_GROUPS, buyingOn, domainFee, searchDomains, searchOn, searchWide } from "@/lib/spaceship";

// Domain search: availability and our price (Spaceship's price plus our fee). The Publish dialog asks for the short
// list; the search page (wide=1) for every extension we list plus name ideas.

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = u.get("q")?.slice(0, 120) ?? "";
  const wide = u.get("wide") === "1";
  if (!searchOn()) return NextResponse.json({ enabled: false, buying: false, offers: [], groups: TLD_GROUPS });
  if (!q.trim()) return NextResponse.json({ enabled: true, buying: buyingOn(), fee: domainFee(), offers: [], groups: TLD_GROUPS });
  const limited = overLimit(req, wide ? "domain-search-wide" : "domain-search", wide ? 20 : 60);
  if (limited) return limited;
  const r = wide ? await searchWide(q, u.get("tlds")?.split(",").filter(Boolean)) : await searchDomains(q);
  if ("error" in r) return NextResponse.json({ enabled: true, buying: buyingOn(), error: r.error, offers: [], groups: TLD_GROUPS }, { status: 400 });
  return NextResponse.json({ enabled: true, buying: buyingOn(), fee: domainFee(), offers: r.offers, groups: TLD_GROUPS }, { headers: { "cache-control": "no-store" } });
}
