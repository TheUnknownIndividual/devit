import { NextResponse } from "next/server";
import { z } from "zod";
import { overLimit } from "@/lib/net";
import { logoAccent } from "@/lib/palette";
import { viewer } from "@/lib/accounts";
import { unseal } from "@/lib/secrets";

// "Start from": a GitHub repo or a Figma file, read into a few lines the build prompt can carry.
//  - GitHub: the repo's description, homepage, topics and the start of its README (public repos, no sign-in).
//  - Figma: the file's title and thumbnail via Figma's public oEmbed; the thumbnail's main colour becomes the accent.

// url: a pasted link; repo: "owner/name" picked from the person's own GitHub list (read with their token, so private
// repos work when GitHub was connected with repo access).
const Body = z.union([z.object({ url: z.string().trim().url().max(400) }), z.object({ repo: z.string().trim().regex(/^[\w.-]{1,100}\/[\w.-]{1,100}$/) })]);

const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** README text without markdown noise: badges, images, html, link targets, headings marks. */
const plain = (md: string) => md
  .replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/^#+\s*/gm, "").replace(/[`*_>|]/g, " ");

async function github(owner: string, repo: string, token?: string) {
  const h: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "devit", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: h, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return { error: r?.status === 404 ? token ? "That repo isn't there, or this GitHub connection can't see it." : "That repo isn't public, or doesn't exist." : "GitHub didn't answer. Try again in a minute." };
  const j = (await r.json()) as { full_name: string; description: string | null; homepage: string | null; topics?: string[]; language: string | null };
  const rd = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers: { ...h, accept: "application/vnd.github.raw" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const readme = rd?.ok ? clip(plain(await rd.text()), 420) : "";
  const lines = [
    `From the GitHub repo ${j.full_name}${j.description ? `: ${clip(j.description, 200)}` : ""}.`,
    j.homepage ? `Website ${j.homepage}.` : "",
    j.topics?.length ? `Topics: ${j.topics.slice(0, 6).join(", ")}.` : "",
    readme ? `README: ${readme}` : "",
  ].filter(Boolean);
  return { source: "github" as const, title: j.full_name, text: clip(lines.join(" "), 700), accent: null as string | null, image: null as string | null };
}

async function figma(url: string) {
  const r = await fetch(`https://www.figma.com/api/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return { error: "Figma didn't share that file. Make sure its link is set to anyone with the link can view." };
  const j = (await r.json()) as { title?: string; thumbnail_url?: string };
  const accent = await logoAccent(j.thumbnail_url ?? null);
  const title = j.title?.trim() || "Figma file";
  return { source: "figma" as const, title, text: clip(`Design from the Figma file "${title}".${accent ? ` Use ${accent} as the accent colour.` : ""}`, 300), accent, image: j.thumbnail_url ?? null };
}

export async function POST(req: Request) {
  const limited = overLimit(req, "import", 40);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste a GitHub repo or Figma file link." }, { status: 400 });
  if ("repo" in parsed.data) {
    const { user } = await viewer();
    const token = (user?.github ? unseal(user.github.enc) : null) ?? undefined;
    const [owner, name] = parsed.data.repo.split("/");
    const picked = await github(owner, name, token);
    return "error" in picked ? NextResponse.json(picked, { status: 422 }) : NextResponse.json(picked);
  }
  const u = new URL(parsed.data.url);
  const host = u.hostname.replace(/^www\./, "");
  let out;
  if (host === "github.com") {
    const [owner, repo] = u.pathname.split("/").filter(Boolean);
    if (!owner || !repo || !/^[\w.-]+$/.test(owner + repo)) return NextResponse.json({ error: "Use a repo link like github.com/you/project." }, { status: 400 });
    out = await github(owner, repo.replace(/\.git$/, ""));
  } else if (host === "figma.com") {
    if (!/^\/(file|design|proto|board)\//.test(u.pathname)) return NextResponse.json({ error: "Use a Figma file link (figma.com/design/…)." }, { status: 400 });
    out = await figma(u.toString());
  } else return NextResponse.json({ error: "Only GitHub repos and Figma files for now. For any other site, add ref: and its link to your sentence." }, { status: 400 });
  if ("error" in out) return NextResponse.json(out, { status: 422 });
  return NextResponse.json(out);
}
