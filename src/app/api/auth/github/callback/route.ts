import { NextResponse, type NextRequest } from "next/server";
import { completeMethod, takeChallenge, updateUser, viewer } from "@/lib/accounts";
import { exchangeCode, GH_STATE_COOKIE, githubCallback, githubOn, githubUser, type GithubIntent } from "@/lib/github";
import { publicOrigin } from "@/lib/google";
import { seal } from "@/lib/secrets";
import { sameSecret } from "@/lib/site-access";

// GitHub sends the visitor back with ?code&state. Sign-in: sign in, make the account, or link it. Connect: keep a
// repo-scoped token on the signed-in account (sealed) so the builder can push code, and link the method if it's free.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const state = q.get("state") ?? "", cookie = req.cookies.get(GH_STATE_COOKIE)?.value ?? "";
  if (!githubOn()) return fail("GitHub isn't set up on this server yet.");
  if (q.get("error")) return fail(q.get("error") === "access_denied" ? "GitHub sign-in was cancelled." : "GitHub didn't sign you in.");
  const s = state && cookie && sameSecret(state, cookie) ? await takeChallenge<{ intent: GithubIntent; next: string }>(`github-${state}`) : null;
  if (!s) return fail("That GitHub link expired. Try again.");
  try {
    const { token, scopes } = await exchangeCode(q.get("code") ?? "", githubCallback(req));
    const g = await githubUser(token);
    const method = { kind: "github" as const, id: String(g.id), label: g.login, at: Date.now(), ...(g.email ? { email: g.email } : {}) };
    let userId: string;
    if (s.intent === "connect") {
      const v = await viewer();
      if (!v.user) return fail("Sign in to devit first, then connect GitHub.");
      userId = v.user.id;
      await completeMethod(method); // links it as a sign-in too, unless another account already has it (fine either way)
    } else {
      const out = await completeMethod(method);
      if ("error" in out) return fail(out.error);
      userId = out.user.id;
    }
    const canPush = scopes.includes("repo") || scopes.includes("public_repo");
    await updateUser(userId, (u) => {
      u.name ??= g.name;
      u.picture ??= g.avatar;
      // A plain sign-in token can't push; never let it replace a connected one.
      if (canPush || !u.github || u.github.id !== g.id) u.github = { id: g.id, login: g.login, enc: seal(token), scopes, at: Date.now() };
    });
    const r = NextResponse.redirect(`${publicOrigin(req)}${s.next}`, 303);
    r.cookies.delete({ name: GH_STATE_COOKIE, path: "/api/auth/github" });
    return r;
  } catch (e) {
    return fail((e as Error).message);
  }
}

function fail(msg: string) {
  const esc = msg.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GitHub didn't finish</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#08080A;color:#EDEDEF;font:14px system-ui,sans-serif"><main style="max-width:360px;padding:24px"><h1 style="font-size:16px;margin:0 0 8px">GitHub didn't finish</h1><p style="color:#a1a1aa;margin:0 0 16px">${esc}</p><a href="/" style="color:#C6F24E">Back to devit</a></main>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
