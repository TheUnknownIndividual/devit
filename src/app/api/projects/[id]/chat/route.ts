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
import { snapshot } from "@/lib/history";
import { connectorContext } from "@/lib/connector-context";
import { askAbout, planChange } from "@/lib/assist";
import { THEMES, fitAccent, readableOn } from "@/lib/themes";
import { overLimit } from "@/lib/net";
import { ownerKeysFor } from "@/lib/accounts";
import { editable } from "@/lib/access";
import { runWithKeys } from "@/lib/keyscope";
import { modelFrom } from "@/lib/models";
import { projectEntitled } from "@/lib/entitlements";
import { redactLeaks, removedNote } from "@/lib/leaks";

const Body = z.object({
  text: z.string().trim().min(1).max(1200),
  /** Ids of pictures uploaded to this project, for this message. */
  assets: z.array(z.string().max(24)).max(6).optional(),
  /** Text files the person dropped in (read in the browser), passed along as context. */
  docs: z.array(z.object({ name: z.string().max(80), text: z.string().max(6000) })).max(3).optional(),
  /** plan: say what would change and wait; ask: answer without changing anything. */
  mode: z.enum(["edit", "plan", "ask"]).optional(),
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
  return runWithKeys(await ownerKeysFor(g.p.ownerId), () => chat(req, ctx), await projectEntitled(g.p, "priorityModels"), modelFrom(req));
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

  // Leak firewall: a key or token in the message (or a dropped file) never reaches a model or the history. The message
  // is kept with the secret cut out, and nothing else runs.
  const red = redactLeaks(text);
  const docLeaks = (docs ?? []).flatMap((d) => redactLeaks(d.text).removed);
  if (red.removed.length || docLeaks.length) {
    const removed = [...new Set([...red.removed, ...docLeaks])];
    const saved = await updateProject(id, (q) => {
      q.messages.push({ id: newId(), role: "user", text: red.text, at: Date.now() });
      q.messages.push({ id: newId(), role: "agent", text: `${removedNote(removed)} Send the request again without it.`, at: Date.now(), via: "leak firewall" });
    });
    return saved ? NextResponse.json(publicProject(saved)) : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const own = new Set((p.assets ?? []).map((a) => a.id));
  const assets = (parsed.data.assets ?? []).filter((a) => own.has(a));
  const assetUrls = (p.assets ?? []).filter((a) => assets.includes(a.id)).map((a) => a.url);

  // Plan and Ask answer in the chat and leave the site as it is.
  if (parsed.data.mode === "plan" || parsed.data.mode === "ask") {
    const mode = parsed.data.mode;
    const plan = mode === "plan";
    const res = plan ? await planChange(p, text) : await askAbout(p, text);
    const steps: string[] = "steps" in res ? (res.steps as string[]) : [];
    const out = await updateProject(id, (q) => {
      q.messages.push({ id: newId(), role: "user", text, at: Date.now(), mode });
      q.messages.push({ id: newId(), role: "agent", text: res.reply, at: Date.now(), via: res.via, ...(plan && steps.length ? { plan: { request: text, steps } } : {}) });
    });
    return NextResponse.json(out ? publicProject(out) : { error: "not found" });
  }

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
      snapshot(q, `Look taken from ${read[0].host}`);
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
      snapshot(q, addr ? "Token pulled in" : "Socials added");
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
  const cx = await connectorContext(p, text);
  const res = await applyComments(p, [{ id: newId(), blockId: target.id, blockLabel: "Whole page", text: text + context, assets, ...(cx.text ? { context: cx.text } : {}) }]);
  if (cx.used.length) res.via = `${res.via} · read ${cx.used.join(", ")}`;
  const out = await updateProject(id, (q) => {
    if (!q.spec) return;
    snapshot(q, text);
    q.spec = res.spec;
    q.version += 1;
    q.messages.push({ id: newId(), role: "user", text: docs?.length ? `${text} (with ${docs.map((d) => d.name).join(", ")})` : text, at: Date.now(), ...(assetUrls.length ? { assets: assetUrls } : {}) });
    q.messages.push({ id: newId(), role: "agent", text: res.message, at: Date.now(), via: res.via });
  });
  return NextResponse.json(out ? publicProject(out) : { error: "not found" });
}
