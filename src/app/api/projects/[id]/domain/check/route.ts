import { NextResponse } from "next/server";
import { updateProject } from "@/lib/store";
import { editable } from "@/lib/accounts";
import { needsPlan, projectEntitled } from "@/lib/entitlements";
import { overLimit } from "@/lib/net";
import { cfEnabled, cfEnsure, checkDns, claimedElsewhere, customTarget, domainView, nextStatus } from "@/lib/domains";
import { syncRouting } from "@/lib/routing";

// "Check DNS": reads the TXT proof and where the domain points, moves the status on, and once the domain is proven
// makes (or refreshes) its Cloudflare custom hostname.

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "dns-check", 120);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  if (!(await projectEntitled(g.p, "customDomain"))) return needsPlan("customDomain");
  const d = g.p.domain;
  const target = customTarget();
  if (!d || !target) return NextResponse.json({ error: "Add a domain first." }, { status: 400 });

  const check = await checkDns(d, target);
  if (d.status === "pending" && check.txt.ok && (await claimedElsewhere(d.host, id))) return NextResponse.json({ error: "That domain is already connected to another site." }, { status: 409 });
  let cf = d.cf;
  if ((d.status !== "pending" || check.txt.ok) && cfEnabled()) {
    const r = await cfEnsure(d.host, d.cf?.id);
    cf = "error" in r ? { id: d.cf?.id ?? "", status: d.cf?.status ?? "error", ssl: d.cf?.ssl ?? "unknown", error: r.error } : r;
  }
  const p = await updateProject(id, (q) => {
    if (q.domain?.host !== d.host) return;
    q.domain.cf = cf;
    q.domain.status = nextStatus(q.domain, check);
    q.domain.checkedAt = Date.now();
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  await syncRouting(p);
  return NextResponse.json({ ...(await domainView(p, true)), check });
}
