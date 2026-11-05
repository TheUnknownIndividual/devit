import { NextResponse, type NextRequest } from "next/server";
import { editable } from "@/lib/access";
import { siteCredit } from "@/lib/credit";
import { exportFiles, repoNameFor, zip } from "@/lib/export";
import { publicOrigin } from "@/lib/google";
import { overLimit } from "@/lib/net";

/** The site's code as a zip: a standalone Next.js app (see lib/export.ts). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "export", 30);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  if (!g.p.spec) return NextResponse.json({ error: "The site isn't built yet." }, { status: 409 });
  const origin = publicOrigin(req);
  const credit = await siteCredit(g.p);
  const files = await exportFiles(g.p, origin, credit === "/" ? origin : credit);
  const name = repoNameFor(g.p);
  return new NextResponse(new Uint8Array(zip(files, name)), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}.zip"`, "cache-control": "no-store" },
  });
}
