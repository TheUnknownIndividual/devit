import { editable } from "@/lib/access";
import { readSignups, toCsv } from "@/lib/database";

// Every form entry as a CSV, newest first (up to 10,000).

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const s = await readSignups(g.p, 10_000);
  const name = `${(g.p.slug || g.p.id).replace(/[^a-z0-9-]/gi, "")}-signups.csv`;
  return new Response(toCsv(s.rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
