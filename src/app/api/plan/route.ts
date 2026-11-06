import { NextResponse } from "next/server";
import { z } from "zod";
import { overLimit } from "@/lib/net";
import { planSite } from "@/lib/assist";
import { CHAIN_IDS, THEME_IDS } from "@/lib/spec";

const Body = z.object({
  prompt: z.string().trim().min(3).max(1200),
  kind: z.enum(["memecoin", "dapp", "nft"]).default("memecoin"),
  chain: z.enum(CHAIN_IDS).default("near"),
  style: z.enum(THEME_IDS).optional(),
});

/** Plan mode on the landing page: the sections and style the build would use, before it starts. */
export async function POST(req: Request) {
  const limited = overLimit(req, "plan", 60);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe your site in a sentence first." }, { status: 400 });
  const { prompt, kind, chain, style } = parsed.data;
  return NextResponse.json(await planSite(prompt, kind, chain, style));
}
