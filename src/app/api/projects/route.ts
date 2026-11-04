import { NextResponse } from "next/server";
import { z } from "zod";
import { runBuild } from "@/lib/agent";
import { saveProject } from "@/lib/store";
import { CHAIN_IDS, THEME_IDS, newId, type Project } from "@/lib/spec";
import { overLimit } from "@/lib/net";
import { buildsToday, countBuild, ensureAnon, ownerKeysFor, viewer } from "@/lib/accounts";
import { hasOwnLlm, runWithKeys } from "@/lib/keyscope";
import { plan } from "@/lib/plans";
import { planOf } from "@/lib/entitlements";

const Body = z.object({
  prompt: z.string().trim().min(3).max(1200),
  chain: z.enum(CHAIN_IDS).default("near"),
  kind: z.enum(["memecoin", "dapp", "nft"]).default("memecoin"),
  address: z.string().trim().max(120).optional(),
  style: z.enum(THEME_IDS).optional(),
  socials: z.object({ x: z.string().trim().max(120).optional(), telegram: z.string().trim().max(120).optional(), website: z.string().trim().max(200).optional(), discord: z.string().trim().max(120).optional() }).optional(),
});

export async function POST(req: Request) {
  const limited = overLimit(req, "build", 12);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe your site in a sentence first." }, { status: 400 });
  const { prompt, chain, kind, address, style, socials } = parsed.data;
  // The plan's daily build cap, per account or per anonymous browser. Builds on the owner's own model key are free.
  const v = await viewer();
  const anon = v.user ? undefined : await ensureAnon();
  const keys = await ownerKeysFor(v.user?.id);
  const who = v.user ? `user:${v.user.id}` : `anon:${anon}`;
  const cap = plan(await planOf(v.user)).buildsPerDay;
  if (cap != null && !hasOwnLlm(keys) && (await buildsToday(who)) >= cap) {
    return NextResponse.json({ error: `That's the ${cap} free builds for today. Edits still work, or go Pro or add your own model key in Settings for more.`, limit: true }, { status: 429 });
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
  if (!hasOwnLlm(keys)) await countBuild(who);
  // The build writes its progress into the project; the workspace polls it.
  void runWithKeys(keys, () => runBuild(p.id)).catch(() => undefined);
  return NextResponse.json({ id: p.id });
}
