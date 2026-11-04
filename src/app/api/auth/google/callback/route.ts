import { NextResponse, type NextRequest } from "next/server";
import { completeMethod, takeChallenge, updateUser } from "@/lib/accounts";
import { callbackUrl, exchange, googleOn, publicOrigin, STATE_COOKIE } from "@/lib/google";
import { sameSecret } from "@/lib/site-access";

// Google sends the visitor back here with ?code&state. Signed out: sign in (or make the account). Signed in: link it.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const state = q.get("state") ?? "", cookie = req.cookies.get(STATE_COOKIE)?.value ?? "";
  const back = (next: string) => { const r = NextResponse.redirect(`${publicOrigin(req)}${next}`, 303); r.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/google" }); return r; };
  if (!googleOn()) return fail("Google sign-in isn't set up on this server yet.");
  if (q.get("error")) return fail(q.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google didn't sign you in.");
  const s = state && cookie && sameSecret(state, cookie) ? await takeChallenge<{ verifier: string; nonce: string; next: string }>(`google-${state}`) : null;
  if (!s) return fail("That sign-in link expired. Try again.");
  try {
    const g = await exchange(q.get("code") ?? "", s.verifier, callbackUrl(req), s.nonce);
    const out = await completeMethod({ kind: "google", id: g.sub, label: g.email, at: Date.now() });
    if ("error" in out) return fail(out.error);
    if (g.name && !out.user.name) await updateUser(out.user.id, (u) => { u.name ??= g.name; });
    return back(s.next);
  } catch (e) {
    return fail((e as Error).message);
  }
}

function fail(msg: string) {
  const esc = msg.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in didn't finish</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#08080A;color:#EDEDEF;font:14px system-ui,sans-serif"><main style="max-width:360px;padding:24px"><h1 style="font-size:16px;margin:0 0 8px">Google sign-in didn't finish</h1><p style="color:#a1a1aa;margin:0 0 16px">${esc}</p><a href="/" style="color:#C6F24E">Back to sitesmith</a></main>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
