import { NextResponse } from "next/server";
import { z } from "zod";
import { runBuild } from "@/lib/agent";
import { saveProject, updateProject } from "@/lib/store";
import { CHAIN_IDS, THEME_IDS, newId, type Project } from "@/lib/spec";
import { clientIp, overLimit } from "@/lib/net";
import { countBuild, ensureAnon, ownerKeysFor, viewer } from "@/lib/accounts";
import { outOfCredits, payerFor, reserve, settle } from "@/lib/credits";
import { runMeter, type Meter } from "@/lib/meter";
import { entitled } from "@/lib/entitlements";
import { hasOwnLlm, runWithKeys } from "@/lib/keyscope";
import { withBuildSlot } from "@/lib/buildqueue";
import { modelFrom } from "@/lib/models";
import { findLeaks } from "@/lib/leaks";
import { BUILDS_PER_HOUR } from "@/lib/plans";

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
  const paid = await entitled(v.user, "priorityModels");
  const limited = overLimit(req, "build", paid ? BUILDS_PER_HOUR.paid : BUILDS_PER_HOUR.free);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe your site in a sentence first." }, { status: 400 });
  const { prompt, chain, kind, address, style, socials } = parsed.data;
  // Leak firewall: a description with a key or token in it is refused before anything is saved or sent to a model.
  const leaks = [...new Set(findLeaks(prompt).map((l) => l.kind))];
  if (leaks.length) return NextResponse.json({ error: `Your description has ${leaks.join(" and ")} in it. Take it out and try again: keys never go to the model or into a site.`, leak: true }, { status: 400 });
  // AI credits: the build is charged what it really costs, from the plan's credits then packs. Out of credits with
  // an own model key, it runs on that key alone.
  const anon = v.user ? undefined : await ensureAnon();
  const keys = await ownerKeysFor(v.user?.id);
  const who = v.user ? `user:${v.user.id}` : `anon:${anon}`;
  const own = hasOwnLlm(keys);
  const payer = await payerFor(v.user, clientIp(req));
  const ticket = await reserve(payer, "build");
  if (!ticket && !own) return outOfCredits(payer);
  const meter: Meter = { usd: 0, ours: !!ticket };
  const done = () => (ticket ? settle(ticket, meter.usd) : Promise.resolve());
  const full = address && !prompt.includes(address) ? `${prompt} ${address}` : prompt;
  const now = Date.now();
  const p: Project = {
    id: newId(12), slug: "", prompt: full, kind, style, socials, createdAt: now, updatedAt: now, status: "building",
    steps: [], messages: [{ id: newId(), role: "user", text: full, at: now }],
    spec: null, history: [], network: { chain }, integrations: {}, published: null, version: 0,
    ...(v.user ? { ownerId: v.user.id } : { anon }),
  };
  try {
    await saveProject(p);
  } catch {
    await done();
    return NextResponse.json({ error: "Couldn't start the build. Try again." }, { status: 500 });
  }
  await countBuild(who);
  // The build writes its progress into the project; the workspace polls it. On our models it takes a slot first.
  const priority = await entitled(v.user, "priorityModels");
  let waited = false;
  const slot = () => withBuildSlot(priority, async () => { if (waited) await started(p.id); return runBuild(p.id); }, () => { waited = true; return queued(p.id); });
  // Charged once the build is over, whatever happened: the models were paid for either way.
  const ran = runMeter(meter, () => runWithKeys(keys, () => (own ? runBuild(p.id) : slot()), priority, modelFrom(req)));
  void ran.then(done, done).catch(() => undefined);
  return NextResponse.json({ id: p.id });
}
