import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteProject, getProject, updateProject } from "@/lib/store";
import { removeUploads } from "@/lib/uploads";
import { editable } from "@/lib/access";
import { dropLocal } from "@/lib/database";
import { canRead } from "@/lib/site-access";
import { cfRemove } from "@/lib/domains";
import { dropRouting } from "@/lib/routing";
import { readableOn, restyle, withHeroOf } from "@/lib/themes";
import { publicProject } from "@/lib/public";
import { snapshot } from "@/lib/history";
import { isPublicHttps } from "@/lib/net";
import { CHAIN_IDS, THEME_IDS } from "@/lib/spec";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getProject(id).catch(() => null);
  if (!p || !(await canRead(p, undefined, new URL(req.url).searchParams.get("share")))) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicProject(p), { headers: { "cache-control": "no-store" } });
}

const Patch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  chain: z.enum(CHAIN_IDS).optional(),
  rpcUrl: z.union([z.literal(""), z.string().max(400).refine(isPublicHttps, "Use a public https RPC URL")]).optional(),
  walletconnectProjectId: z.union([z.literal(""), z.string().regex(/^[0-9a-f]{32}$/i)]).optional(),
  privyAppId: z.union([z.literal(""), z.string().regex(/^[a-z0-9]{25}$/i)]).optional(),
  gaId: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^G-[A-Z0-9]{4,16}$/, "A GA4 measurement ID looks like G-XXXXXXXXXX.")]).optional(),
  /** The Search Console token, or the whole <meta name="google-site-verification" …> tag pasted as it is. */
  gscToken: z.string().trim().max(400).transform((v) => v.match(/content=["']([^"']+)["']/i)?.[1] ?? v).pipe(z.union([z.literal(""), z.string().regex(/^[A-Za-z0-9_-]{20,80}$/, "Paste the HTML tag from Search Console, or just its content value.")])).optional(),
  themeId: z.enum(THEME_IDS).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** A picture uploaded to this project (its /api/assets url) as the site's logo; "" goes back to the token's. */
  logo: z.string().max(400).optional(),
  /** Connector (MCP) ids switched off for this project. */
  connectorsOff: z.array(z.string().max(24)).max(8).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad input" }, { status: 400 });
  const b = parsed.data;
  const g = await editable(id);
  if (g instanceof Response) return g;
  // A built site's chain is fixed: its token, buy box and copy are made for it. A multi-chain project moves only
  // between the chains it was made for.
  if (b.chain) {
    const cur = await getProject(id);
    if (cur?.spec && b.chain !== cur.network.chain && !(cur.network.chains ?? []).includes(b.chain)) {
      return NextResponse.json({ error: "This site is built for one chain. Start a new project for another chain." }, { status: 409 });
    }
  }
  const p = await updateProject(id, (p) => {
    // A rename is the project's name in lists and the builder; the site's own copy keeps its name unless it has none yet.
    if (b.name) {
      p.name = b.name;
      if (p.spec && !p.spec.name.trim()) p.spec.name = b.name;
    }
    if (b.chain && b.chain !== p.network.chain && (!p.spec || (p.network.chains ?? []).includes(b.chain))) {
      // Each chain of a multi-chain project keeps its own RPC: park this one's, bring that one's back.
      if (p.network.chains) {
        const urls = { ...(p.network.rpcUrls ?? {}) };
        if (p.network.rpcUrl) urls[p.network.chain] = p.network.rpcUrl; else delete urls[p.network.chain];
        p.network.rpcUrl = urls[b.chain];
        delete urls[b.chain];
        p.network.rpcUrls = urls;
      }
      p.network.chain = b.chain;
    }
    if (b.rpcUrl !== undefined) p.network.rpcUrl = b.rpcUrl || undefined;
    if (b.walletconnectProjectId !== undefined) p.integrations.walletconnectProjectId = b.walletconnectProjectId || undefined;
    if (b.connectorsOff) p.connectorsOff = b.connectorsOff.length ? [...new Set(b.connectorsOff)] : undefined;
    if (b.privyAppId !== undefined) p.integrations.privyAppId = b.privyAppId || undefined;
    if (b.gaId !== undefined) p.integrations.gaId = b.gaId || undefined;
    if (b.gscToken !== undefined) p.integrations.gscToken = b.gscToken || undefined;
    if (p.spec && b.logo !== undefined && (b.logo === "" || (p.assets ?? []).some((a) => a.url === b.logo))) {
      snapshot(p, b.logo ? "New logo" : "Logo reset");
      p.spec.logo = b.logo || null;
      p.version += 1;
    }
    if (p.spec && (b.themeId || b.accent)) {
      snapshot(p, b.themeId ? `Style changed to ${b.themeId}` : `Accent changed to ${b.accent}`);
      if (b.themeId) { p.spec.theme = restyle(p.spec.theme, b.themeId); p.spec.blocks = withHeroOf(p.spec.blocks, b.themeId); }
      if (b.accent) p.spec.theme = { ...p.spec.theme, accent: b.accent, accentText: readableOn(b.accent) };
      p.version += 1;
    }
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicProject(p));
}

/** Deletes the project, its pictures and, with them, its published site. Its owner or its team's owner only. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id, "owner");
  if (g instanceof Response) return g;
  await deleteProject(id);
  await removeUploads(id).catch(() => undefined);
  await dropLocal(id);
  await dropRouting(id);
  if (g.p.domain?.cf?.id) await cfRemove(g.p.domain.cf.id);
  return NextResponse.json({ ok: true });
}
