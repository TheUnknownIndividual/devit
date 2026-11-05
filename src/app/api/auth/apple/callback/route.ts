import { NextResponse, type NextRequest } from "next/server";
import { completeMethod, takeChallenge, updateUser } from "@/lib/accounts";
import { APPLE_STATE_COOKIE, appleCallbackUrl, appleExchange, appleOn } from "@/lib/apple";
import { publicOrigin } from "@/lib/google";
import { sameSecret } from "@/lib/site-access";

// Apple POSTs code, state and (on the first sign-in only) the user's name here. Signed out: sign in or make the account.
// Signed in: link it. The session cookie is set on this response and the 303 lands the visitor back where they started.
export async function POST(req: NextRequest) {
  const f = await req.formData().catch(() => null);
  const field = (k: string) => (typeof f?.get(k) === "string" ? (f!.get(k) as string) : "");
  const state = field("state"), cookie = req.cookies.get(APPLE_STATE_COOKIE)?.value ?? "";
  if (!appleOn()) return fail("Apple sign-in isn't set up on this server yet.");
  if (field("error")) return fail(field("error") === "user_cancelled_authorize" ? "Apple sign-in was cancelled." : "Apple didn't sign you in.");
  const s = state && cookie && sameSecret(state, cookie) ? await takeChallenge<{ nonce: string; next: string }>(`apple-${state}`) : null;
  if (!s) return fail("That sign-in link expired. Try again.");
  try {
    const a = await appleExchange(field("code"), appleCallbackUrl(req), s.nonce);
    let name: string | null = null;
    try {
      const u = JSON.parse(field("user") || "null") as { name?: { firstName?: string; lastName?: string } } | null;
      name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(" ").trim().slice(0, 80) || null;
    } catch { /* Apple only sends the name the first time */ }
    const label = a.email && !a.privateEmail ? a.email : a.email ? "Apple ID (hidden email)" : "Apple ID";
    const out = await completeMethod({ kind: "apple", id: a.sub, label, at: Date.now() });
    if ("error" in out) return fail(out.error);
    if (name && !out.user.name) await updateUser(out.user.id, (u) => { u.name ??= name; });
    const r = NextResponse.redirect(`${publicOrigin(req)}${s.next}`, 303);
    r.cookies.set(APPLE_STATE_COOKIE, "", { path: "/api/auth/apple", maxAge: 0, secure: true, sameSite: "none" });
    return r;
  } catch (e) {
    return fail((e as Error).message);
  }
}

function fail(msg: string) {
  const esc = msg.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in didn't finish</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#08080A;color:#EDEDEF;font:14px system-ui,sans-serif"><main style="max-width:360px;padding:24px"><h1 style="font-size:16px;margin:0 0 8px">Apple sign-in didn't finish</h1><p style="color:#a1a1aa;margin:0 0 16px">${esc}</p><a href="/" style="color:#C6F24E">Back to sitesmith</a></main>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
