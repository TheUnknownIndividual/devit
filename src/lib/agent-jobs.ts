import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { newId } from "@/lib/spec";

// Edits run in the background. A long edit (a slow model, a fix pass) can take minutes, and the proxy in front of us
// drops any request that's silent for 100 seconds, which showed up as "That didn't go through" while the work went on.
// So the builder starts a job, gets its id at once, and polls. The job also says what the agent is on (a stage line
// and the sections it's touching), which the preview shows as the agent's cursor.

/** Where the agent is working: a section, a named part of it, or the words it is changing. */
export interface AgentFocus { blockId: string; element?: string; text?: string }
export interface AgentJob {
  id: string;
  kind: "chat" | "apply";
  startedAt: number;
  stage: string;
  focus: AgentFocus[];
  result?: { status: number; body: unknown };
  doneAt?: number;
  /** Stopped by the person: model calls are aborted and nothing is saved. */
  cancelled?: boolean;
  ctrl: AbortController;
}

const g = globalThis as unknown as { __devitJobs?: Map<string, AgentJob> };
const jobs = (g.__devitJobs ??= new Map<string, AgentJob>());
const als = new AsyncLocalStorage<AgentJob>();
const KEEP_MS = 10 * 60_000;

/** The project's current (or just finished) job. */
export function jobOf(projectId: string): AgentJob | null {
  const j = jobs.get(projectId);
  if (j?.doneAt && Date.now() - j.doneAt > KEEP_MS) { jobs.delete(projectId); return null; }
  return j ?? null;
}

/** The builder asks for background edits with this header; anything else (scripts, older tabs) waits as before. */
export const wantsJob = (req: Request) => req.headers.get("x-devit-async") === "1";

/** A copy of the request with its body read, so the work can still read it after we've answered. */
export async function buffered(req: Request): Promise<Request> {
  const body = await req.text();
  return new Request(req.url, { method: req.method, headers: req.headers, body });
}

/** Starts `work` in the background and answers 202 with the job id (409 while another edit is still running). */
export function startJob(projectId: string, kind: AgentJob["kind"], focus: AgentFocus[], work: () => Promise<Response>): Response {
  const cur = jobOf(projectId);
  if (cur && !cur.doneAt) return NextResponse.json({ error: "Still working on the last change. This one goes next.", busy: true }, { status: 409 });
  const job: AgentJob = { id: newId(), kind, ctrl: new AbortController(), startedAt: Date.now(), stage: focus.length ? "Looking at what you picked" : "Reading the page", focus: focus.slice(0, 6) };
  jobs.set(projectId, job);
  void als.run(job, async () => {
    let res: Response;
    try {
      res = await work();
    } catch (e) {
      console.error(`[job] ${kind} ${projectId} failed`, e);
      res = NextResponse.json({ error: "Something broke while making that change. Try again." }, { status: 500 });
    }
    if (job.cancelled) return;
    job.result = { status: res.status, body: await res.json().catch(() => ({})) };
    job.doneAt = Date.now();
    job.stage = "Done";
    job.focus = [];
  });
  return NextResponse.json({ job: job.id }, { status: 202 });
}

/** What the agent is doing now, in a few words ("Checking it in a real browser"). No-op outside a job. */
export function agentStage(stage: string): void {
  const j = als.getStore();
  if (j && !j.doneAt) j.stage = stage;
}

/** The sections (or parts) the agent is working on now. No-op outside a job. */
export function agentFocus(focus: AgentFocus[]): void {
  const j = als.getStore();
  if (!j || j.doneAt || !focus.length) return;
  const key = (f: AgentFocus) => `${f.blockId}|${f.element ?? ""}|${f.text ?? ""}`;
  if (focus.map(key).join() === j.focus.map(key).join()) return;
  j.focus = focus.slice(0, 6);
}

/** Stops a running job: its model calls are aborted, and its work checks `jobCancelled()` before saving anything. */
export function cancelJob(projectId: string, jobId: string): boolean {
  const j = jobs.get(projectId);
  if (!j || j.id !== jobId || j.doneAt) return false;
  j.cancelled = true;
  j.result = { status: 499, body: { cancelled: true } };
  j.doneAt = Date.now();
  j.stage = "Stopped";
  j.focus = [];
  j.ctrl.abort();
  return true;
}

/** Whether the job this code runs in was stopped (always false outside a job). */
export const jobCancelled = (): boolean => !!als.getStore()?.cancelled;

/** A request timeout that also ends when the person stops the job. */
export function jobTimeout(ms: number): AbortSignal {
  const j = als.getStore();
  return j ? AbortSignal.any([AbortSignal.timeout(ms), j.ctrl.signal]) : AbortSignal.timeout(ms);
}

/** The answer a stopped job's work returns instead of saving. */
export const stoppedResponse = () => NextResponse.json({ cancelled: true }, { status: 499 });
