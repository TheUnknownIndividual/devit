import { NextResponse, type NextRequest } from "next/server";
import { editable } from "@/lib/access";
import { siteCredit } from "@/lib/credit";
import { exportFiles } from "@/lib/export";
import { publicOrigin } from "@/lib/google";
import { overLimit } from "@/lib/net";

// The code view in the builder: the same files Export ships (spec, blocks, app shell), as text, read-only.

const TEXT = /\.(tsx?|jsx?|mjs|cjs|json|css|md|txt|html|ya?ml|svg|env\.example)$|(^|\/)(\.gitignore|LICENSE)$/i;
const MAX = 200_000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "export", 60);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  if (!g.p.spec) return NextResponse.json({ error: "The site isn't built yet." }, { status: 409 });
  const origin = publicOrigin(req);
  const credit = await siteCredit(g.p);
  const files = await exportFiles(g.p, origin, credit === "/" ? origin : credit);
  const out = files
    .filter((f) => TEXT.test(f.path))
    .map((f) => ({ path: f.path, size: f.data.length, text: f.data.length > MAX ? `${f.data.subarray(0, MAX).toString("utf8")}\n\n… (cut at 200 KB; the export has the whole file)` : f.data.toString("utf8") }))
    .sort((a, b) => (a.path.endsWith("site.json") ? -1 : b.path.endsWith("site.json") ? 1 : a.path.localeCompare(b.path)));
  return NextResponse.json({ files: out }, { headers: { "cache-control": "no-store" } });
}
