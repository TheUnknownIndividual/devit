import { NextResponse } from "next/server";
import { viewer } from "@/lib/accounts";
import { githubOn, githubRepos } from "@/lib/github";
import { unseal } from "@/lib/secrets";
import { overLimit } from "@/lib/net";

/** The signed-in person's GitHub repos, newest push first, for "Import a GitHub repository" on the landing page. */
export async function GET(req: Request) {
  const limited = overLimit(req, "github-repos", 60);
  if (limited) return limited;
  const { user } = await viewer();
  if (!user) return NextResponse.json({ signedIn: false, connected: false, available: githubOn() });
  if (!user.github) return NextResponse.json({ signedIn: true, connected: false, available: githubOn() });
  const g = user.github;
  const canPrivate = g.scopes.includes("repo");
  const token = unseal(g.enc);
  if (!token) return NextResponse.json({ signedIn: true, connected: false, available: githubOn(), error: "Link GitHub again to list your repositories." });
  try {
    const repos = await githubRepos(token);
    return NextResponse.json({ signedIn: true, connected: true, available: true, login: g.login, avatar: `https://avatars.githubusercontent.com/u/${g.id}?s=64`, canPrivate, repos });
  } catch (e) {
    return NextResponse.json({ signedIn: true, connected: false, available: githubOn(), error: e instanceof Error ? e.message : "GitHub didn't answer." }, { status: 200 });
  }
}
