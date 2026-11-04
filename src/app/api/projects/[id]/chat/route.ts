import { NextResponse } from "next/server";
import { z } from "zod";
import { applyComments, foundLine, siteLinks } from "@/lib/agent";
import { readReference, refsIn, withoutRefs } from "@/lib/reference";
import { orderLike, refBlockOrder, refLine, themeFromRef } from "@/lib/ref-style";
import { findAddress, tokenContext } from "@/lib/chain";
import { research, socialsFromText } from "@/lib/research";
import { getProject, updateProject } from "@/lib/store";
import { CHAINS, newId, type Block, type SiteSpec } from "@/lib/spec";
import { publicProject } from "@/lib/public";
import { THEMES, fitAccent, readableOn } from "@/lib/themes";
import { overLimit } from "@/lib/net";
import { editable, ownerKeysFor } from "@/lib/accounts";
import { runWithKeys } from "@/lib/keyscope";

const Body = z.object({
  text: z.string().trim().min(1).max(1200),
  /** Ids of pictures uploaded to this project, for this message. */
  assets: z.array(z.string().max(24)).max(6).optional(),
  /** Text files the person dropped in (read in the browser), passed along as context. */
  docs: z.array(z.object({ name: z.string().max(80), text: z.string().max(6000) })).max(3).optional(),
});

/** A posts block goes in above the socials once there are posts to show. */
function withPosts(spec: SiteSpec): Block[] {
  if (!spec.x?.posts.length || spec.blocks.some((b) => b.type === "posts")) return spec.blocks;
  const at = spec.blocks.findIndex((b) => b.type === "socials");
  const b: Block = { id: `posts-${newId(5)}`, type: "posts", props: { title: `From @${spec.x.profile.handle}`, count: 3 } };
  const next = [...spec.blocks];
  next.splice(at < 0 ? next.length - 1 : at, 0, b);
  return next;
}

/**
 * A chat message. A contract address pulls in the token; socials (an @handle, t.me, discord or a site) are added
 * and researched; anything else is a page-wide edit.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  // Model calls and chain reads run on the owner's own keys when they've added some.
  return runWithKeys(await ownerKeysFor(g.p.ownerId), () => chat(req, ctx));
}

async function chat(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "edit", 80);
  if (limited) return limited;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "empty" }, { status: 400 });
  const { text, docs } = parsed.data;
  const p = await getProject(id);
  if (!p?.spec) return NextResponse.json({ error: "not ready" }, { status: 409 });
  const own = new Set((p.assets ?? []).map((a) => a.id));
  const assets = (parsed.data.assets ?? []).filter((a) => own.has(a));
  const assetUrls = (p.assets ?? []).filter((a) => assets.includes(a.id)).map((a) => a.url);

  // "ref: https://…": read that site and take its look and section order, keeping the team's words and colour.
  const refs = refsIn(text);
  if (refs.length) {
    const read = (await Promise.all(refs.map((u) => readReference(u).catch(() => null)))).filter((x) => !!x);
    const rest = withoutRefs(text).trim();
    const out = await updateProject(id, async (q) => {
      q.messages.push({ id: newId(), role: "user", text, at: Date.now(), ...(assetUrls.length ? { assets: assetUrls } : {}) });
      if (!q.spec || !read.length) {
        q.messages.push({ id: newId(), role: "agent", text: `I couldn't open ${refs.map((u) => new URL(u).host).join(", ")}. If it's up, it may block automated visits; try another page of it.`, at: Date.now() });
        return;
      }
      q.history.push(structuredClone(q.spec));
      if (q.history.length > 30) q.history.shift();
      const r = read[0];
      // The team's colour stays: an accent that isn't the style's stock one was theirs.
      const stock = THEMES[q.spec.theme.id];
      const brand = q.spec.theme.accent !== stock.accent ? q.spec.theme.accent : q.research?.brand?.color ?? null;
      q.spec.theme = await themeFromRef(r, q.spec.theme, brand);
      const order = refBlockOrder(r);
      const before = q.spec.blocks.map((b) => b.id).join();
      q.spec.blocks = orderLike(q.spec.blocks, order);
      q.refs = [...read, ...(q.refs ?? []).filter((o) => !read.some((n) => n.host === o.host))].slice(0, 4);
      q.version += 1;
      q.messages.push({ id: newId(), role: "agent", at: Date.now(), text: refLine(r, q.spec.theme, q.spec.blocks.map((b) => b.id).join() !== before) + (rest.length > 3 ? " Send the rest of your note on its own and I'll do that next." : "") });
    });
    return NextResponse.json(out ? publicProject(out) : { error: "not found" });
  }

  const addr = findAddress(text);
  const socials = socialsFromText(addr ? text.replace(addr, " ") : text);
  const hasSocials = Object.values(socials).some(Boolean);

  if (addr || hasSocials) {
    const token = addr ? await tokenContext(addr, p.network.chain, p.network.rpcUrl) : p.spec.token;
    const given = { ...(p.socials ?? {}), ...socials };
    const r = addr && !token ? null : await research(token, given);
    const out = await updateProject(id, (q) => {
      q.messages.push({ id: newId(), role: "user", text, at: Date.now() });
      if (!q.spec || (addr && !token)) {
        q.messages.push({ id: newId(), role: "agent", text: "I couldn't find that token on NEAR, Solana, Ethereum, Base, BNB Chain or Robinhood Chain.", at: Date.now() });
        return;
      }
      q.history.push(structuredClone(q.spec));
      const said: string[] = [];
      if (addr && token) {
        q.spec.token = token;
        q.spec.chain = token.chain;
        q.spec.ticker = token.symbol.toUpperCase();
        q.network.chain = token.chain;
        said.push(`Pulled in $${token.symbol} on ${CHAINS[token.chain].name} (via ${token.sources.join(", ")}).`);
      }
      if (r) {
        q.socials = given;
        q.research = r;
        q.spec.links = siteLinks(r);
        if (r.x) q.spec.x = { profile: r.x.profile, posts: r.x.posts.slice(0, 6) };
        q.spec.blocks = withPosts(q.spec);
        // Their own colour replaces the theme's stock accent, never one the team picked.
        const stock = THEMES[q.spec.theme.id];
        if (r.brand && q.spec.theme.id !== "cozy" && q.spec.theme.accent === stock.accent) {
          const accent = fitAccent(r.brand.color, stock.dark);
          q.spec.theme = { ...q.spec.theme, accent, accentText: readableOn(accent) };
          said.push(`Matched the accent to your ${r.brand.from} (${accent}).`);
        }
        said.push(foundLine(r));
      }
      q.version += 1;
      q.messages.push({ id: newId(), role: "agent", at: Date.now(), text: said.join(" ") });
    });
    return NextResponse.json(out ? publicProject(out) : { error: "not found" });
  }

  const target = p.spec.blocks.find((b) => b.type === "hero") ?? p.spec.blocks[0];
  const context = docs?.length ? `\n\nFrom the files they added:\n${docs.map((d) => `--- ${d.name}\n${d.text}`).join("\n")}` : "";
  const res = await applyComments(p, [{ id: newId(), blockId: target.id, blockLabel: "Whole page", text: text + context, assets }]);
  const out = await updateProject(id, (q) => {
    if (!q.spec) return;
    q.history.push(structuredClone(q.spec));
    q.spec = res.spec;
    q.version += 1;
    if (q.history.length > 30) q.history.shift();
    q.messages.push({ id: newId(), role: "user", text: docs?.length ? `${text} (with ${docs.map((d) => d.name).join(", ")})` : text, at: Date.now(), ...(assetUrls.length ? { assets: assetUrls } : {}) });
    q.messages.push({ id: newId(), role: "agent", text: res.message, at: Date.now(), via: res.via });
  });
  return NextResponse.json(out ? publicProject(out) : { error: "not found" });
}
