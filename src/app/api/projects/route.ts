import { NextResponse } from "next/server";
import { z } from "zod";
import { runBuild } from "@/lib/agent";
import { saveProject } from "@/lib/store";
import { CHAIN_IDS, THEME_IDS, newId, type Project } from "@/lib/spec";
import { overLimit } from "@/lib/net";

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
  const full = address && !prompt.includes(address) ? `${prompt} ${address}` : prompt;
  const now = Date.now();
  const p: Project = {
    id: newId(12), slug: "", prompt: full, kind, style, socials, createdAt: now, updatedAt: now, status: "building",
    steps: [], messages: [{ id: newId(), role: "user", text: full, at: now }],
    spec: null, history: [], network: { chain }, integrations: {}, published: null, version: 0,
  };
  await saveProject(p);
  // The build writes its progress into the project; the workspace polls it.
  void runBuild(p.id).catch(() => undefined);
  return NextResponse.json({ id: p.id });
}
