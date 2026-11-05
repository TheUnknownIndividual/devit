import { NextResponse, type NextRequest } from "next/server";
import { putChallenge } from "@/lib/accounts";
import { GH_STATE_COOKIE, githubCallback, githubOn, scopeFor, type GithubIntent } from "@/lib/github";
import { safeNext } from "@/lib/google";
import { overLimit } from "@/lib/net";
import { token } from "@/lib/secrets";

// Starts GitHub: ?intent=signin (profile + email) or connect (adds `repo`, to export code). ?next= is where to land after.
export async function GET(req: NextRequest) {
  if (!githubOn()) return NextResponse.json({ error: "GitHub isn't set up on this server yet." }, { status: 503 });
  const limited = overLimit(req, "github", 30);
  if (limited) return limited;
  const intent: GithubIntent = req.nextUrl.searchParams.get("intent") === "connect" ? "connect" : "signin";
  const state = token(18);
  await putChallenge(`github-${state}`, { intent, next: safeNext(req.nextUrl.searchParams.get("next")) }, 10 * 60_000);
  const u = new URL("https://github.com/login/oauth/authorize");
  u.search = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID!, redirect_uri: githubCallback(req), scope: scopeFor(intent), state, allow_signup: "true" }).toString();
  const res = NextResponse.redirect(u.toString(), 302);
  res.cookies.set(GH_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/github", maxAge: 600 });
  return res;
}
