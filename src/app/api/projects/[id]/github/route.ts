import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { editable } from "@/lib/access";
import { getUser, updateUser } from "@/lib/accounts";
import { siteCredit } from "@/lib/credit";
import { exportFiles, repoNameFor } from "@/lib/export";
import { pushFiles, validRepoName } from "@/lib/github";
import { publicOrigin } from "@/lib/google";
import { overLimit } from "@/lib/net";
import { unseal } from "@/lib/secrets";
import { updateProject } from "@/lib/store";

const Body = z.object({ name: z.string().max(100).optional(), private: z.boolean().optional(), fresh: z.boolean().optional() });

/** Push the site's code to GitHub: a new repo the first time, then a commit on the same repo each time after. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "github-push", 20);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const { p, v } = g;
  if (!v.user) return NextResponse.json({ error: "Sign in to push to GitHub." }, { status: 401 });
  if (!p.spec) return NextResponse.json({ error: "The site isn't built yet." }, { status: 409 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const u = await getUser(v.user.id);
  const gh = u?.github;
  const token = gh ? unseal(gh.enc) : null;
  if (!u || !gh || !token || !(gh.scopes.includes("repo") || gh.scopes.includes("public_repo"))) return NextResponse.json({ error: "Connect GitHub first.", connect: true }, { status: 412 });
  const name = (b.data.name?.trim() || repoNameFor(p)).replace(/\s+/g, "-");
  if (!validRepoName(name)) return NextResponse.json({ error: "Repo names can use letters, numbers, dots, dashes and underscores." }, { status: 400 });

  const origin = publicOrigin(req);
  const credit = await siteCredit(p);
  const files = await exportFiles(p, origin, credit === "/" ? origin : credit);
  // Same repo again only while it's the connected account's; a fresh repo when asked or after switching accounts.
  const again = !b.data.fresh && p.github && p.github.repo.split("/")[0].toLowerCase() === gh.login.toLowerCase() ? p.github.repo : undefined;
  try {
    const out = await pushFiles(token, files, {
      repo: again, name, private: b.data.private ?? true, description: `${p.spec.name} ($${p.spec.ticker}) website, built with devit`,
      message: again ? `Update site from devit (v${p.version})` : "Site from devit",
    });
    const github = { ...out, at: Date.now() };
    await updateProject(p.id, (q) => { q.github = github; });
    return NextResponse.json({ github });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) await updateUser(u.id, (x) => { x.github = undefined; });
    if (status === 404 && again) return NextResponse.json({ error: `${again} is gone or this GitHub account can't reach it. Push to a new repo instead.`, gone: true }, { status: 409 });
    if (status === 422) return NextResponse.json({ error: `You already have a repo called ${name}. Pick another name.` }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message, connect: status === 401 }, { status: status === 401 ? 412 : 502 });
  }
}
