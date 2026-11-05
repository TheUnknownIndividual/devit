import { NextResponse } from "next/server";
import { z } from "zod";
import { runBuild } from "@/lib/agent";
import { saveProject, updateProject } from "@/lib/store";
import { CHAIN_IDS, THEME_IDS, newId, type Project } from "@/lib/spec";
import { overLimit } from "@/lib/net";
import { buildsToday, countBuild, ensureAnon, ownerKeysFor, viewer } from "@/lib/accounts";
import { entitled, planOf } from "@/lib/entitlements";
import { hasOwnLlm, runWithKeys } from "@/lib/keyscope";
import { withBuildSlot } from "@/lib/buildqueue";
import { modelFrom } from "@/lib/models";
import { BUILDS_PER_HOUR, FAIR_USE_BUILDS_PER_DAY, plan } from "@/lib/plans";

const Body = z.object({
  prompt: z.string().trim().min(3).max(1200),
  chain: z.enum(CHAIN_IDS).default("near"),
  kind: z.enum(["memecoin", "dapp", "nft"]).default("memecoin"),
  address: z.string().trim().max(120).optional(),
  style: z.enum(THEME_IDS).optional(),
  socials: z.object({ x: z.string().trim().max(120).optional(), telegram: z.string().trim().max(120).optional(), website: z.string().trim().max(200).optional(), discord: z.string().trim().max(120).optional() }).optional(),
});

/** Shows a queued build as a step, so the workspace says why nothing moves yet. */
const queued = (id: string) => updateProject(id, (p) => { p.steps.push({ id: "queue", title: "Waiting for a build slot", detail: "Busy right now. Pro builds skip the line.", state: "running", at: Date.now() }); });
const started = (id: string) => updateProject(id, (p) => { const s = p.steps.find((x) => x.id === "queue"); if (s && s.state === "running") { s.state = "done"; s.detail = "Your turn"; s.at = Date.now(); } });

export async function POST(req: Request) {
  const v = await viewer();
  const paid = await entitled(v.user, "unlimitedBuilds");
  const limited = overLimit(req, "build", paid ? BUILDS_PER_HOUR.paid : BUILDS_PER_HOUR.free);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe your site in a sentence first." }, { status: 400 });
  const { prompt, chain, kind, address, style, socials } = parsed.data;
  // The plan's daily build cap, per account or per anonymous browser; "unlimited" stops at fair use. Builds on the
  // owner's own model key are free.
  const anon = v.user ? undefined : await ensureAnon();
  const keys = await ownerKeysFor(v.user?.id);
  const who = v.user ? `user:${v.user.id}` : `anon:${anon}`;
  const cap = paid ? FAIR_USE_BUILDS_PER_DAY : plan(await planOf(v.user)).buildsPerDay ?? FAIR_USE_BUILDS_PER_DAY;
  if (!hasOwnLlm(keys) && (await buildsToday(who)) >= cap) {
    const error = paid ? `That's ${cap} builds today, the fair-use cap. Edits still work; builds open again tomorrow (UTC).` : `That's the ${cap} free builds for today. Edits still work, or go Pro or add your own model key in Settings for more.`;
    return NextResponse.json({ error, limit: true, upgrade: paid ? undefined : "pro" }, { status: 429 });
  }
  const full = address && !prompt.includes(address) ? `${prompt} ${address}` : prompt;
  const now = Date.now();
  const p: Project = {
    id: newId(12), slug: "", prompt: full, kind, style, socials, createdAt: now, updatedAt: now, status: "building",
    steps: [], messages: [{ id: newId(), role: "user", text: full, at: now }],
    spec: null, history: [], network: { chain }, integrations: {}, published: null, version: 0,
    ...(v.user ? { ownerId: v.user.id } : { anon }),
  };
  await saveProject(p);
  const own = hasOwnLlm(keys);
  if (!own) await countBuild(who);
  // The build writes its progress into the project; the workspace polls it. On our models it takes a slot first.
  const priority = await entitled(v.user, "priorityModels");
  let waited = false;
  const slot = () => withBuildSlot(priority, async () => { if (waited) await started(p.id); return runBuild(p.id); }, () => { waited = true; return queued(p.id); });
  void runWithKeys(keys, () => (own ? runBuild(p.id) : slot()), priority, modelFrom(req)).catch(() => undefined);
  return NextResponse.json({ id: p.id });
}
