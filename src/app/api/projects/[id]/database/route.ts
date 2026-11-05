import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProject } from "@/lib/store";
import { editable } from "@/lib/access";
import { overLimit } from "@/lib/net";
import { connect, createInstantNeon, databaseView, flushLocal, parseNeon, parseSupabase, readSignups, recheck, SUPABASE_SQL, supabaseSqlUrl } from "@/lib/database";
import type { Project, ProjectDatabase } from "@/lib/spec";
import { unseal } from "@/lib/secrets";

// The project's database: GET what's connected and the latest form entries; POST make a free one, connect one, or
// re-check the table; DELETE disconnect (the database itself is left as it is).

const noStore = { "cache-control": "no-store" };

async function view(p: Project) {
  const s = await readSignups(p, 50);
  const db = p.database;
  let sqlUrl: string | null = null;
  if (db?.provider === "supabase" && !db.ready) {
    try { sqlUrl = supabaseSqlUrl((JSON.parse(unseal(db.secret) ?? "{}") as { url?: string }).url ?? ""); } catch { sqlUrl = null; }
  }
  return {
    database: databaseView(db),
    // The claim link is for editors only, so it rides here rather than on the project.
    claimUrl: db?.claimUrl ?? null,
    sql: db?.provider === "supabase" && !db.ready ? SUPABASE_SQL : null,
    sqlUrl,
    rows: s.rows,
    count: s.count,
    held: s.held,
    error: s.error ?? null,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  return NextResponse.json(await view(g.p), { headers: noStore });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("instant") }),
  z.object({ action: z.literal("neon"), connectionString: z.string().max(1000) }),
  z.object({ action: z.literal("supabase"), url: z.string().max(200), key: z.string().max(2000) }),
  z.object({ action: z.literal("check") }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const b = parsed.data;

  let db: ProjectDatabase;
  if (b.action === "check") {
    const next = await recheck(g.p);
    if (!next) return NextResponse.json({ error: "No database is connected." }, { status: 400 });
    db = next;
  } else {
    const limited = overLimit(req, `db-${b.action}`, b.action === "instant" ? 4 : 20);
    if (limited) return limited;
    let r: { db: ProjectDatabase } | { error: string };
    if (b.action === "instant") r = await createInstantNeon();
    else if (b.action === "neon") {
      const n = parseNeon(b.connectionString);
      r = "error" in n ? n : await connect({ cs: n.cs }, "neon", n.host);
    } else {
      const s = parseSupabase(b.url, b.key);
      r = "error" in s ? s : await connect({ url: s.url, key: s.key }, "supabase", s.host);
    }
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    db = r.db;
    if (db.ready) await flushLocal(id, null, db).catch((e) => console.warn(`[database] ${id} moving held entries failed: ${(e as Error).message}`));
  }
  const p = await updateProject(id, (q) => { q.database = db; });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await view(p));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const p = await updateProject(id, (q) => { q.database = undefined; });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await view(p));
}
