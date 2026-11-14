import { NextResponse } from "next/server";
import { editable } from "@/lib/access";
import { cancelJob, jobOf } from "@/lib/agent-jobs";

/** The project's edit job: what the agent is on while it runs, and the answer once it's done. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const j = jobOf(id);
  const want = new URL(req.url).searchParams.get("job");
  if (!j || (want && j.id !== want)) return NextResponse.json({ job: null }, { headers: { "cache-control": "no-store" } });
  return NextResponse.json(
    { job: { id: j.id, kind: j.kind, stage: j.stage, focus: j.focus, startedAt: j.startedAt, done: !!j.doneAt, ...(j.doneAt && want ? { result: j.result } : {}) } },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Stop: ends the running edit. Nothing it was doing is saved. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const job = new URL(req.url).searchParams.get("job") ?? "";
  return NextResponse.json({ stopped: cancelJob(id, job) });
}
